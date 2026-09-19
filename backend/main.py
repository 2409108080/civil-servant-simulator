# -*- coding: utf-8 -*-
"""
后端入口。

本服务不持久化任何玩家数据：前端每次把完整 PlayerStatus 传上来，
这里校验 → 拼提示词 → 调 DeepSeek → 校验返回 → 回传事件，请求结束即忘。

**但事件已经不走这条路了。** 事件改由前端本地事件池同步抽取
（frontend/src/game/eventPool.js），玩家点「推进工作」不再有等待。
/api/event 与其提示词作为死代码保留（不调用不花钱），补料时还能用。

考公同理：命题与阅卷都不再调用 AI，题库固化在 backend/data/questions.json，
运行时只读。接口保留，前端不必改，但响应是毫秒级的。

路由：
  GET  /health                  健康检查，暴露模型名、Key 是否就绪、题库概况
  POST /api/contract/validate   契约自检，只校验不调 AI，联调时先打通这个
  POST /api/event               生成事件（**已无人调用**，保留作补料入口）
  POST /api/exam/generate       考公组卷，从本地题库抽 5 道单选题
  POST /api/exam/evaluate       考公阅卷，判档查题库，算分与分配由 Python 硬编码裁定
  GET  /*                       前端构建产物（见文件末尾的静态挂载）

**成品形态是一个进程**：本文件末尾把 frontend/dist 挂到根路径，
于是页面与 /api/* 同源同端口——不需要反代、不需要配 CORS、不需要第二个服务。
dist 不在（开发态）就自动跳过，两端各起各的，与以前完全一样。
"""

import logging
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import get_settings
from models import ExamEvaluateRequest, ExamGenerateRequest, PlayerStatus
from services.deepseek import generate_event
from services.exam import evaluate_exam, generate_exam_questions
from services.question_bank import bank_summary

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

settings = get_settings()

app = FastAPI(title="公务员晋升模拟器 · AI 中转站", version="1.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    """
    健康检查。

    api_key_loaded 现在只对 /api/event 有意义了：事件与考公都已经本地化，
    Key 没配也照样能玩，只是补料脚本跑不了。题库概况一并暴露——
    questions.json 读坏了的话，这里能一眼看出来（source 会变成 seed）。
    """
    return {
        "ok": True,
        "model": settings.deepseek_model,
        "base_url": settings.deepseek_base_url,
        "api_key_loaded": settings.is_configured,
        "json_mode": settings.use_json_mode,
        "timeout": settings.request_timeout,
        "question_bank": bank_summary(),
    }


@app.post("/api/contract/validate")
def validate_contract(status: PlayerStatus) -> dict:
    """
    契约自检端点：只校验前端上报的 JSON 是否合法，不调用 AI。
    前端联调时先打这个口，格式跑通再开 /api/event。
    """
    return {
        "ok": True,
        "nextLevel": status.next_level,
        "echo": status.to_prompt_payload(),
    }


@app.post("/api/event")
def create_event(status: PlayerStatus) -> dict:
    """
    生成一个突发事件。

    返回结构：
      {
        "event": { id, title, description, options: [{ id, text, costAp, effects }] },
        "meta":  { "source": "ai" | "fallback", "reason": "...", "attempts": 1 }
      }

    外层包一层 meta 是为了让前端能知道这次到底是 AI 生成的还是兜底事件——
    调优提示词时如果没有这个信号，很容易把兜底内容误当成 AI 输出。
    前端 api 层会拆包，业务代码拿到的仍是裸 GameEvent。

    本接口**不会**因为 AI 故障而返回 5xx：超时、非法 JSON、格式跑偏一律降级为兜底事件。
    """
    event, meta = generate_event(status)
    if meta["source"] == "fallback":
        logging.getLogger("api.event").warning("降级为兜底事件：%s", meta["reason"])
    return {"event": event, "meta": meta}


@app.post("/api/exam/generate")
def create_exam(payload: Optional[ExamGenerateRequest] = None) -> dict:
    """
    考公组卷：从本地题库抽一套 5 道单选题，**毫秒级返回，不调用 AI**。

    返回结构：
      {
        "questions": [ { id, type, stem, options: [{id, text}], best, rationale } ],
        "meta": { "source": "bank" | "emergency", "reason": "" }
      }

    题型配比（2 逻辑 / 1 情商 / 2 对策）与题量由 models.EXAM_COMPOSITION 硬编码，
    抽样严格按这个顺序拼，因为分值是按题号绑定的。

    注意 `best`（完美选项）会一并下发。本服务不持久化数据，阅卷时靠**题干**
    反查题库（见 services/question_bank.py），所以完美选项无法留在服务端。
    单人本地游戏无对抗性，这个代价可以接受；换来的是阅卷完全可复现。

    source 为 emergency 表示题库文件读不出来，用的是内置兜底题库——
    考试照常进行，但只有那 5 道老题。正常情况下不该看到这个值。
    """
    questions, meta = generate_exam_questions()
    if meta["source"] == "emergency":
        logging.getLogger("api.exam").warning("组卷降级为内置题库：%s", meta["reason"])
    return {"questions": questions, "meta": meta}


@app.post("/api/exam/evaluate")
def evaluate(request: ExamEvaluateRequest) -> dict:
    """
    考公阅卷：算分、定档、分配单位。

    返回结构：
      {
        "result": {
          score, baseScore, bonus, maxScore,
          unitType, unit, position, comment, aiComment, attributeBonus,
          breakdown: [...], review: [...]
        },
        "meta": { "source": "bank", "reason": "" }
      }

    判档、算分与分配**全部由 Python 硬编码决定**：三档等级（full / half / zero）
    查自题库里写好的答案键，分值是 models.EXAM_COMPOSITION 里按题号绑定的权重，
    红线是 models.EXAM_TIERS。没有任何外部依赖，因此不会失败、不需要降级。

    aiComment（阅卷人评语）也是本地拼的：三档分布 + 拖后腿的那条线，
    见 services/exam.py 的 _build_grade_comment()。
    """
    result, meta = evaluate_exam(request)
    return {"result": result, "meta": meta}


# ══════════════ 静态挂载：把前端一起端出来 ══════════════
#
# 为什么要在一个"AI 中转站"里托管前端：**发布形态**。
# 生产构建（npm run build）不经过 vue.config.js 的 devServer，
# 原先 /api/* 的代理随之消失——玩家打开页面，考公那一屏必然连不上后端。
# 出路有两条：让部署层配一层反代，或者让后端自己把 dist 端出来。
# 后者把一个进程、一个端口、一个地址的事做完了：没有反代要维护，
# 没有跨域要开白名单（同源），也没有"前端起了后端没起"这种半截状态。
#
# 挂载点必须是 "/"，而且必须写在**所有路由之后**：Starlette 按注册顺序匹配，
# mount("/") 是兜底的那一条，写在前面会把 /api/* 和 /health 一起吞掉，
# 而且是静默吞掉——接口突然变成 404，报错信息里一个字都不会提这个 mount。
#
# 前端是 hash 路由（#/exam、#/dashboard），路径部分永远只有 "/"，
# 所以 html=True 足够，不需要 SPA 那种"找不到就回 index.html"的回退规则。
#
# dist 不存在时不报错、只提示：开发态本来就该两端各起各的。
DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if DIST_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="frontend")
    logging.getLogger("startup").info("已挂载前端构建产物：%s", DIST_DIR)
else:
    logging.getLogger("startup").warning(
        "未找到前端构建产物 %s，本次只提供 /api/*。"
        "要玩完整流程先执行：cd frontend && npm run build",
        DIST_DIR,
    )
