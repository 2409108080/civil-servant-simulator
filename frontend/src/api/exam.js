/**
 * 考公接口层。
 *
 * 命题与阅卷**都已经本地化**：题库固化在 backend/data/questions.json，
 * 判档查的是题库里写好的答案键。两个接口都是读文件 + 算分，毫秒级返回，
 * 不再调用 AI，也不会降级——所以这里不做任何兜底，失败就只剩一种可能：
 * 后端没起来（连接直接被拒）。
 *
 * 超时因此可以给得很紧。原先给 110 秒是因为命题要等 AI 半分钟，
 * 现在留着长超时没有意义：真出问题也只会在"后端挂着不响应"这一种情况下
 * 干等，那还不如快点报到界面上。
 *
 * 注意 questions 必须原样回传：后端不持久化数据，阅卷时靠**题干**反查题库
 * 取回 half（半分项）与选项点评（见 backend/services/question_bank.py）。
 * 这里任何"顺手裁一下字段"的优化都会让判档退化成对错判定。
 */

const GENERATE_TIMEOUT = 20000
const EVALUATE_TIMEOUT = 20000

/** 带超时的 POST */
async function postJson(url, body, timeout) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    if (!response.ok) {
      // 422 是契约不符，值得把后端的具体信息带出来，否则联调时只能干瞪眼
      if (response.status === 422) {
        let detail = ''
        try {
          const payload = await response.json()
          const first = (payload.detail && payload.detail[0]) || {}
          detail = [].concat(first.loc || []).join('.') + ' ' + (first.msg || '')
        } catch (err) {
          detail = ''
        }
        throw new Error(`报文不符合契约（422）${detail ? '：' + detail : ''}`)
      }
      throw new Error(`接口返回 ${response.status}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 取一整套试卷。
 * @returns {{questions: Array, source: string, reason: string}}
 *          source 正常是 bank；emergency 表示后端读不到题库文件、用了内置兜底，
 *          组卷仍然成功，只是可抽的题少。界面不消费这个字段，留着排查用。
 */
export async function fetchExamQuestions(playerName = '') {
  const payload = await postJson('/api/exam/generate', { playerName }, GENERATE_TIMEOUT)
  const questions = (payload && payload.questions) || []
  return {
    questions,
    source: (payload && payload.meta && payload.meta.source) || 'bank',
    reason: (payload && payload.meta && payload.meta.reason) || ''
  }
}

/**
 * 交卷阅卷。
 * @param {Array} questions 原题（后端不存题库，必须原样回传的做题记录）
 * @param {Object} answers  题号 → 所选选项 id
 * @returns {{result: Object, source: string, reason: string}}
 */
export async function submitExam(questions, answers, playerName = '') {
  const payload = await postJson(
    '/api/exam/evaluate',
    {
      playerName,
      questions,
      answers: Object.keys(answers).map((questionId) => ({
        questionId,
        choice: answers[questionId]
      }))
    },
    EVALUATE_TIMEOUT
  )
  return {
    result: (payload && payload.result) || null,
    source: (payload && payload.meta && payload.meta.source) || 'bank',
    reason: (payload && payload.meta && payload.meta.reason) || ''
  }
}
