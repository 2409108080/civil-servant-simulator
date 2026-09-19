# -*- coding: utf-8 -*-
"""
后端入口。

本服务不持久化任何玩家数据：前端每次把完整 PlayerStatus 传上来，
这里校验 → 拼提示词 → 调 DeepSeek → 校验返回 → 回传事件，请求结束即忘。

**但事件已经不走这条路了。** 事件改由前端本地事件池同步抽取
（frontend/src/game/eventPool.js），玩家点「推进工作」不再有等待。
/api/event 与其提示词作为死代码保留（不调用不花钱），补料时还能用。

考公同理：命题与阅卷都不再调用 AI，题库固化在 backend/data/questions.json，
运行时只读。1.0.0 起连这一层也搬进了前端（frontend/src/game/examPaper.js），
**玩家路径上一个请求都不发了**，这几个接口留着是为了本地开发与补料时手动打。

路由：
  GET  /health                  健康检查，暴露模型名、Key 是否就绪、题库概况
  POST /api/contract/validate   契约自检，只校验不调 AI，联调时先打通这个
  POST /api/event               生成事件（**已无人调用**，保留作补料入口）
  POST /api/exam/generate       考公组卷，从本地题库抽 5 道单选题（前端已不用）
  POST /api/exam/evaluate       考公阅卷，判档查题库，算分与分配由 Python 硬编码裁定（前端已不用）
  GET  /*                       前端构建产物（见文件末尾的静态挂载，本地预览用）

── 成品形态 ────────────────────────────────────────────────
发出去的是**一堆静态文件**（frontend/dist，托管在 Vercel 上），
没有进程要活着：存档在浏览器里，事件与考公都在浏览器里算。
所以这个后端**不是玩家路径上的东西**，它是开发和补料的工具箱：
  · start.bat 本地一键跑（构建 dist + 起本进程，一个地址就能玩）
  · scripts/ 补事件、补题库、跑探针
  · /api/event 在补料脚本里用来找模型要新事件
本文件末尾把 dist 挂到根路径，就是给上面那个本地预览形态用的。
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


# ══════════════ 静态挂载：本地一键跑的预览形态 ══════════════
#
# 线上不需要这一手（Vercel 直接发 frontend/dist 里的静态文件）。
# 它服务的是**本地**：start.bat 构建完 dist 之后起本进程，浏览器打开
# 127.0.0.1:8000 就能玩，不用再单独开一个 npm run serve。
# 一个进程、一个端口、一个地址，没有反代要维护，也没有"前端起了后端没起"
# 这种半截状态。注意它服务的只是**本地便利**：这个进程不开，页面就打不开，
# 但它开着的时候也不干什么活——游戏本身不需要它（这是与 0.x 最大的不同）。
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
