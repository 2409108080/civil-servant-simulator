# -*- coding: utf-8 -*-
"""
DeepSeek 调用（OpenAI 兼容 SDK）。

防御层次，从外到内：
  1. 未配置 API Key           → 直接兜底，不发请求
  2. 请求超时 / 网络错误 / 限流 → 重试一次，仍失败则兜底
  3. 返回内容裹了 markdown 围栏、带了前言后记 → 正则清洗后解析
  4. 解析出的 JSON 不符合 GameEvent 契约     → 归一化修复，修不动就兜底
  5. 一切正常                                → 返回 AI 事件

任何一层失败都不会把异常抛给前端，只会降级为兜底事件。
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from pydantic import ValidationError

from config import get_settings
from models import RESOURCE_KEYS, GameEvent, PlayerStatus
from prompts import SYSTEM_PROMPT, build_user_prompt, pick_fallback

logger = logging.getLogger(__name__)

# ```json ... ``` 或 ``` ... ``` 围栏
_FENCE_RE = re.compile(r"```(?:json|JSON)?\s*(.*?)\s*```", re.S)
# 尾随逗号：{"a":1,} / [1,2,]
_TRAILING_COMMA_RE = re.compile(r",\s*([}\]])")
# 零宽字符与 BOM，模型偶尔会吐
_INVISIBLE_RE = re.compile(r"[﻿​‌‍]")

# 出现在引号后面、说明这个引号是「结构引号」而非正文内容的字符
_STRUCTURAL_AFTER = set(":,}]")

_client = None


def _get_client():
    """惰性创建客户端。未配置 Key 时返回 None，由上层走兜底。"""
    global _client
    settings = get_settings()
    if not settings.is_configured:
        return None
    if _client is None:
        from openai import OpenAI

        _client = OpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
            timeout=settings.request_timeout,
            # 关掉 SDK 自带的隐式重试（默认 2 次）。它会在网络抖动/限流时
            # 于后台偷偷重发，外面还套着 generate_event 的应用层重试，
            # 最坏情况变成 3×2 次调用，延迟完全失控且日志上看不出来。
            # 重试策略只能有一处，就是我们自己那层。
            max_retries=0,
        )
    return _client


def clean_json_text(raw: str) -> str:
    """
    把模型返回的文本清洗成可 json.loads 的字符串。

    依次做四件事：去不可见字符 → 剥 markdown 围栏 → 截取最外层花括号 → 去尾随逗号。
    每一步都是幂等的，重复调用无副作用。
    """
    if not raw:
        return ""

    text = _INVISIBLE_RE.sub("", raw).strip()

    fence = _FENCE_RE.search(text)
    if fence:
        text = fence.group(1).strip()

    # 截取第一个 { 到最后一个 }，丢掉模型情不自禁加上的前言后记
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        text = text[start : end + 1]

    text = _TRAILING_COMMA_RE.sub(r"\1", text)
    return text.strip()


def repair_unescaped_quotes(text: str) -> str:
    """
    修复模型写在字符串值内部的、未转义的英文双引号。

    模型写中文对话时经常吐出这种：

        "text": "他说"原则上可以"，先按这个口径报"

    这在 JSON 里非法，json.loads 报 `Expecting ',' delimiter`——而 clean_json_text()
    那四步（去不可见字符、剥围栏、截花括号、去尾逗号）一步都修不了它。
    修不了就只能整个重试，白等一次模型往返（实测 6.5 秒，3 次里中 1 次）。

    做法：扫一遍并跟踪「当前是否在字符串内」。遇到引号时，看它后面第一个非空白字符：
      - 是 : , } ] 之一 → 这是结构引号（在闭合当前字符串）
      - 否则           → 这是被写进正文的引号，转义掉
    顺带把字符串内的裸控制字符（换行/制表）转义，那也是非法 JSON。

    已知取舍：正文里有连续多个引号时，会全部转义，
    正文可能多出一两个引号。修复畸形输入本来就做不到百分百还原，
    多两个引号远好过白等一次模型往返。

    幂等：已经合法的 JSON 经此函数不变。
    """
    if not text:
        return text

    out: List[str] = []
    in_string = False
    escaped = False
    idx = 0
    length = len(text)

    while idx < length:
        ch = text[idx]

        if not in_string:
            out.append(ch)
            if ch == '"':
                in_string = True
            idx += 1
            continue

        # ── 以下都在字符串内部 ──
        if escaped:
            out.append(ch)
            escaped = False
            idx += 1
            continue

        if ch == "\\":
            out.append(ch)
            escaped = True
            idx += 1
            continue

        if ch == '"':
            probe = idx + 1
            while probe < length and text[probe] in " \t\r\n":
                probe += 1
            if probe >= length or text[probe] in _STRUCTURAL_AFTER:
                out.append(ch)          # 结构引号，正常闭合
                in_string = False
            else:
                out.append('\\"')       # 正文里的引号，转义
            idx += 1
            continue

        if ch == "\n":
            out.append("\\n")
        elif ch == "\r":
            out.append("\\r")
        elif ch == "\t":
            out.append("\\t")
        elif ord(ch) < 0x20:
            out.append("\\u%04x" % ord(ch))
        else:
            out.append(ch)
        idx += 1

    return "".join(out)


def loads_leniently(text: str) -> Tuple[Optional[Any], str]:
    """
    先按原样 json.loads，失败再尝试修复未转义引号。
    @returns (解析结果 或 None, 失败原因)
    """
    try:
        return json.loads(text), ""
    except json.JSONDecodeError as exc:
        first_error = exc.msg

    repaired = repair_unescaped_quotes(text)
    if repaired != text:
        try:
            parsed = json.loads(repaired)
            logger.info("模型输出含未转义引号，修复后解析成功")
            return parsed, ""
        except json.JSONDecodeError:
            pass

    return None, first_error


def _normalize_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    对通过校验的事件做轻度修复，堵住会直接毁掉玩法的几种情况：
      - 没有零消耗选项 → 玩家行动力耗尽时会被卡死
      - costAp 越界     → 超出季度行动力上限，永远选不了
      - id 重复         → 影响前端避重
    """
    options = event.get("options") or []

    for idx, option in enumerate(options):
        cost = option.get("costAp", 0)
        try:
            cost = int(cost)
        except (TypeError, ValueError):
            cost = 0
        option["costAp"] = max(0, min(3, cost))

    if options and not any(o["costAp"] == 0 for o in options):
        # 把最贵的那个改成免费，保证永远有路可走
        cheapest = min(options, key=lambda o: o["costAp"])
        cheapest["costAp"] = 0
        logger.warning("AI 事件「%s」无零消耗选项，已强制将一项改为 0", event.get("title"))

    if not event.get("id"):
        event["id"] = "evt_ai"

    return event


def _parse_event(content: str) -> Tuple[Optional[Dict[str, Any]], str]:
    """
    解析并校验模型输出。
    @returns (事件字典 或 None, 失败原因)
    """
    cleaned = clean_json_text(content)
    if not cleaned:
        return None, "模型返回内容为空"

    payload, parse_error = loads_leniently(cleaned)
    if payload is None:
        # 留一段原文，否则下次线上再出畸形 JSON 又只能靠猜
        logger.warning("不可解析的模型输出（前 300 字）：%s", cleaned[:300])
        return None, f"JSON 解析失败：{parse_error}"

    if not isinstance(payload, dict):
        return None, "JSON 顶层不是对象"

    payload = _normalize_event(payload)

    try:
        event = GameEvent.model_validate(payload)
    except ValidationError as exc:
        first = exc.errors()[0] if exc.errors() else {}
        loc = ".".join(str(x) for x in first.get("loc", ()))
        return None, f"不符合 GameEvent 契约：{loc} {first.get('msg', '')}"

    return event.model_dump(by_alias=True), ""


def call_json(
    system_prompt: str,
    user_prompt: str,
    max_tokens: Optional[int] = None,
    timeout: Optional[float] = None,
) -> str:
    """
    发一次请求，返回模型输出的**原文**。可能抛异常，由上层捕获。

    这是本服务唯一的模型调用出口——事件生成与考公命题/阅卷共用它，
    OpenAI 管道的细节（模型名、温度、JSON 模式、超时）只在这里出现一次。

    @param max_tokens 输出上限。不传则用全局默认值。
                      命题与阅卷的产出量比事件大一个量级，必须由调用方指定，
                      不能一律套用事件那个 1600（详见 config.py 的说明）。
    @param timeout    本次请求的超时（秒）。不传则用全局默认值。
                      这个参数和 max_tokens 是一对：产出越多写得越久，
                      只调大上限而不调大超时，等于把"写不完"换成了"等不及"，
                      两者都会让接口降级，症状还各不相同（一个回空正文、
                      一个抛 APITimeoutError），排查时很容易只修一半。
    """
    settings = get_settings()
    client = _get_client()
    if client is None:
        raise RuntimeError("未配置 DEEPSEEK_API_KEY")

    limit = max_tokens or settings.max_tokens
    # 客户端构造时已带了一个全局超时，这里是逐请求覆盖它
    wait = timeout or settings.request_timeout
    kwargs: Dict[str, Any] = {
        "model": settings.deepseek_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": settings.temperature,
        "max_tokens": limit,
        "timeout": wait,
    }

    if settings.use_json_mode:
        # DeepSeek 的 JSON 输出模式。若该模型不支持，去掉这一个参数即可
        kwargs["response_format"] = {"type": "json_object"}

    response = client.chat.completions.create(**kwargs)
    choice = response.choices[0]
    finish = choice.finish_reason
    content = (choice.message.content or "").strip()

    if finish == "length":
        # 被截断。这一条日志是刻意留的：截断在旧代码里只会以「模型返回内容为空」
        # 的面目浮上来，从现象完全看不出是上限给小了、还是模型真的没吐字，
        # 只能靠猜。现在把上限与已用 token 数一并写进日志。
        usage = getattr(response, "usage", None)
        logger.warning(
            "模型输出被截断：max_tokens=%s，已生成 %s tokens，正文 %d 字",
            limit,
            getattr(usage, "completion_tokens", "?"),
            len(content),
        )

    if not content:
        # 抛而不是返回空串：空串要在下游绕一圈才变成一句「模型返回内容为空」，
        # 而 finish_reason 这个最关键的线索在这一路上就丢了。
        raise RuntimeError(
            f"模型返回内容为空（finish_reason={finish}，max_tokens={limit}）"
        )

    return content


def _call_model(status: PlayerStatus) -> str:
    """生成事件时的一次调用。"""
    return call_json(SYSTEM_PROMPT, build_user_prompt(status))


def parse_json_object(content: str) -> Tuple[Optional[Dict[str, Any]], str]:
    """
    清洗并解析模型输出的 JSON 对象。
    @returns (字典 或 None, 失败原因)
    """
    cleaned = clean_json_text(content)
    if not cleaned:
        return None, "模型返回内容为空"
    payload, parse_error = loads_leniently(cleaned)
    if payload is None:
        logger.warning("不可解析的模型输出（前 300 字）：%s", cleaned[:300])
        return None, f"JSON 解析失败：{parse_error}"
    if not isinstance(payload, dict):
        return None, "JSON 顶层不是对象"
    return payload, ""


def _safe_error(exc: Exception) -> str:
    """错误信息脱敏——绝不能把 API Key 写进日志或响应。"""
    text = f"{type(exc).__name__}: {exc}"
    settings = get_settings()
    if settings.deepseek_api_key:
        text = text.replace(settings.deepseek_api_key, "***")
    return text[:300]


def generate_event(status: PlayerStatus) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    生成一个事件。**本函数不会抛异常。**

    @returns (事件字典, 元信息)
             元信息含 source（ai / fallback）与失败原因，便于前端提示与排查。
    """
    settings = get_settings()

    if not settings.is_configured:
        return pick_fallback(status), {
            "source": "fallback",
            "reason": "未配置 DEEPSEEK_API_KEY，已使用预置事件",
            "attempts": 0,
        }

    attempts = 0
    last_reason = ""
    total_tries = max(1, settings.max_retries + 1)

    for attempt in range(total_tries):
        attempts = attempt + 1
        try:
            content = _call_model(status)
        except Exception as exc:  # noqa: BLE001 —— 任何异常都降级，不向上抛
            last_reason = f"请求失败：{_safe_error(exc)}"
            logger.warning("DeepSeek 第 %d 次调用失败：%s", attempts, last_reason)
            continue

        event, reason = _parse_event(content)
        if event is not None:
            return event, {"source": "ai", "reason": "", "attempts": attempts}

        last_reason = reason
        logger.warning("DeepSeek 第 %d 次返回不可用：%s", attempts, reason)

    fallback = pick_fallback(status)
    return fallback, {"source": "fallback", "reason": last_reason, "attempts": attempts}
