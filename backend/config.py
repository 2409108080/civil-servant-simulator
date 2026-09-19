# -*- coding: utf-8 -*-
"""
配置读取。

API Key 只从环境变量 / .env 读取，绝不出现在代码、日志或任何返回给前端的响应里。
"""

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


def _get_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _get_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, "").strip())
    except (TypeError, ValueError):
        return default


def _get_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "").strip())
    except (TypeError, ValueError):
        return default


class Settings:
    """运行期配置。实例化一次即可，通过 get_settings() 取用。"""

    def __init__(self) -> None:
        self.deepseek_api_key: str = os.getenv("DEEPSEEK_API_KEY", "").strip()
        self.deepseek_base_url: str = os.getenv(
            "DEEPSEEK_BASE_URL", "https://api.deepseek.com"
        ).strip()
        # 模型名做成可配置：若该 id 不可用，改 .env 一行即可，无需动代码
        self.deepseek_model: str = os.getenv("DEEPSEEK_MODEL", "deepseek-flash").strip()

        self.allow_origins = [
            o.strip()
            for o in os.getenv("ALLOW_ORIGINS", "http://localhost:8080").split(",")
            if o.strip()
        ]

        # AI 调用参数
        # 超时与上限是一对，必须一起看（下面 max_tokens 的注释解释了为什么）。
        # 这个值要**明显小于前端**（frontend/src/api/event.js 的 REQUEST_TIMEOUT）：
        # 后端超时会降级成预置事件（还能玩），前端超时只会中断请求报错。
        self.request_timeout = _get_float("DEEPSEEK_TIMEOUT", 40.0)
        self.temperature = _get_float("DEEPSEEK_TEMPERATURE", 1.0)
        # ⚠️ 这个模型的 reasoning_content 与正文**共用** max_tokens，
        # 而思考比正文长得多——实测一次事件：思考 2320 字 + 正文 606 字，
        # 思考占了整整 79% 的输出。所以"正文才几百 token，1600 够用"是错的：
        # 给 1600 时正文只剩两成额度，实测 6 次里 3 次写不完撞墙，
        # 而且降级是**静默**的（换成预置事件，不报错），玩家只会觉得
        # "AI 怎么老出重复的题目"，很难联想到是预算不够。
        self.max_tokens = _get_int("DEEPSEEK_MAX_TOKENS", 4000)
        # 考公命题与阅卷必须单独给上限，不能跟着上面那个 1600 走。
        # 当年那套卷子是 10 道题 ×（题干 + 4 选项 + 出题人解析），实测正文 4000 字上下。
        # ⚠️ 下面四个 exam_* 现在**没有调用方**：命题与判档都改成了查本地题库，
        # 考公这条路一次模型都不调。它们连同上面那套按"十道题"估出来的值一起
        # 留着，是因为题库若要重新接到模型上，踩过的坑都在这些注释里。
        # 这个常量踩过两次坑，两次都是"以为够"：
        #   1. 中文比想象中贵。实测 1.57 token/字，我先前按 0.6～1 估，低估了两三倍。
        #   2. **这个模型是推理模型，reasoning_content 与正文共用 max_tokens。**
        #      一次命题实测：思考 7135 字 + 正文 4053 字，合计 6361 token。
        #      思考长度不受提示词约束、抖动极大——给 8000 时 3 次里炸 2 次：
        #      思考短就写完，思考长就在半句话上撞墙，表现为间歇性失败，
        #      很容易被误判成"模型偶尔不守格式"而去改提示词，改不好的。
        # max_tokens 是**上限不是预扣**，写不满不额外花钱，所以宁可给宽：
        # 实测给 2 万时正常答卷自然 stop，真撞上长思考也留足了余量。
        self.exam_generate_max_tokens = _get_int("EXAM_GENERATE_MAX_TOKENS", 20000)
        self.exam_grade_max_tokens = _get_int("EXAM_GRADE_MAX_TOKENS", 12000)
        # 超时同样必须跟着产出量走，不能套用上面那个 25 秒——它是按事件
        # （约 600 token、实测 8 秒）定的。卷子要写六倍多的字，
        # 实测 37～48 秒（截断的那些反而更久，因为一路写满到上限），
        # 尾部的抖动轻易就顶穿 25 秒，表现为 APITimeoutError 全线降级。
        # 这个值必须**明显小于前端的 110 秒**（frontend/src/api/exam.js）。
        # 两边原来都是 90，谁先到点是不确定的；而后端超时会降级成预置题库
        # （还能玩），前端超时只会甩一张"命题失败"错误页（只能重试）。
        # 同一个故障点，谁先响决定玩家是"拿到一套备用卷"还是"看到报错"，
        # 所以要让后端先响。留 1.5 倍余量：实测峰值 48 秒。
        self.exam_generate_timeout = _get_float("EXAM_GENERATE_TIMEOUT", 75.0)
        self.exam_grade_timeout = _get_float("EXAM_GRADE_TIMEOUT", 60.0)
        # DeepSeek 支持 JSON 输出模式；置 false 则只靠提示词约束 + 服务端清洗兜底
        self.use_json_mode = _get_bool("DEEPSEEK_JSON_MODE", True)
        # 格式跑偏时的重试次数（不含首次）
        self.max_retries = _get_int("DEEPSEEK_MAX_RETRIES", 1)

    @property
    def is_configured(self) -> bool:
        """没配 Key 时接口走兜底事件，而不是 500。"""
        return bool(self.deepseek_api_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
