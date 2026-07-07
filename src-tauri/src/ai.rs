use std::{env, fs, path::PathBuf, time::Duration};

use serde::{Deserialize, Serialize};

const DEFAULT_MODEL: &str = "deepseek-v4-flash";
const DEEPSEEK_CHAT_URL: &str = "https://api.deepseek.com/chat/completions";

#[derive(Debug, Clone, Serialize)]
pub struct GeneratedTitle {
    pub title: String,
    pub source: TitleSource,
}

#[derive(Debug, Clone, Serialize)]
pub struct GeneratedText {
    pub text: String,
    pub source: TitleSource,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiKeyStatus {
    pub configured: bool,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TitleSource {
    Ai,
    Fallback,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    content: String,
}

pub async fn generate_title(kind: &str, content: &str) -> GeneratedTitle {
    let fallback = fallback_title(content, kind);
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return GeneratedTitle { title: fallback, source: TitleSource::Fallback };
    }

    let Some(api_key) = load_api_key() else {
        return GeneratedTitle { title: fallback, source: TitleSource::Fallback };
    };

    if api_key.trim().is_empty() {
        return GeneratedTitle { title: fallback, source: TitleSource::Fallback };
    }

    let model = env::var("DEEPSEEK_MODEL").unwrap_or_else(|_| DEFAULT_MODEL.to_string());
    let client = match reqwest::Client::builder().timeout(Duration::from_secs(8)).build() {
        Ok(client) => client,
        Err(_) => return GeneratedTitle { title: fallback, source: TitleSource::Fallback },
    };

    let prompt = format!(
        "请为一条{}生成一个中文短标题。要求：只输出标题；不超过12个汉字；不要引号；不要解释；不要换行。内容：{}",
        if kind == "reminder" { "提醒" } else { "便签" },
        trimmed
    );

    let response = client
        .post(DEEPSEEK_CHAT_URL)
        .bearer_auth(api_key.trim())
        .json(&serde_json::json!({
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": "你是轻备忘桌面应用的标题生成器，只返回简短、准确、自然的中文标题。"
                },
                { "role": "user", "content": prompt }
            ],
            "temperature": 0.2,
            "max_tokens": 32,
            "stream": false,
            "thinking": { "type": "disabled" }
        }))
        .send()
        .await;

    let Ok(response) = response else {
        return GeneratedTitle { title: fallback, source: TitleSource::Fallback };
    };

    if !response.status().is_success() {
        return GeneratedTitle { title: fallback, source: TitleSource::Fallback };
    }

    let Ok(body) = response.json::<ChatCompletionResponse>().await else {
        return GeneratedTitle { title: fallback, source: TitleSource::Fallback };
    };

    let title = body
        .choices
        .first()
        .and_then(|choice| sanitize_title(&choice.message.content))
        .unwrap_or_else(|| fallback.clone());

    GeneratedTitle { title, source: TitleSource::Ai }
}

pub async fn generate_assist(mode: &str, content: &str) -> GeneratedText {
    let fallback = fallback_assist(mode, content);
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return GeneratedText { text: fallback, source: TitleSource::Fallback };
    }

    let Some(api_key) = load_api_key() else {
        return GeneratedText { text: fallback, source: TitleSource::Fallback };
    };

    let model = env::var("DEEPSEEK_MODEL").unwrap_or_else(|_| DEFAULT_MODEL.to_string());
    let client = match reqwest::Client::builder().timeout(Duration::from_secs(10)).build() {
        Ok(client) => client,
        Err(_) => return GeneratedText { text: fallback, source: TitleSource::Fallback },
    };

    let instruction = match mode {
        "tease" => "用轻备忘的傲娇可爱语气，对这条便签写一句不超过40字的吐槽或鼓励。",
        "reminder" => "把这条便签拆成1到3条提醒建议，每条包含简短标题和建议时间，用中文短句输出。",
        "time" => "从内容里识别最合适的提醒时间。只输出一行：建议时间 + 简短原因；如果没有明确时间，给一个合理默认建议。",
        "file" => "根据便签内容和文件名识别关联文件用途。逐条输出：文件名：用途说明，每条不超过24字。",
        "organize" => "把这些便签分类成「今天做 / 等待中 / 灵感」，每类最多列5条，输出简洁清单。",
        "summary" => "生成一份今日总结：已记录的事项、需要跟进、下一步建议。用温柔但有一点傲娇的中文，控制在120字内。",
        "compress" => "把长便签压缩成不超过60字的摘要，保留关键行动、对象和时间。",
        "recommend" => "根据内容推荐颜色、优先级、标签和分类。输出格式：颜色/优先级/标签/分类/理由，简洁明确。",
        "dailyRoast" => "用本小姐毒舌模式吐槽拖延事项：嘴硬心软、可爱但有推动力，不超过70字，不要恶意攻击。",
        "nextStep" => "根据这些便签给出1到3条下一步建议。要求：中文短句；具体可执行；可建议转提醒、补负责人、集中催办；不要建议自动删除或自动归档。",
        _ => "把这条便签整理成1到3条可执行行动建议，用中文短句输出。",
    };

    let response = client
        .post(DEEPSEEK_CHAT_URL)
        .bearer_auth(api_key.trim())
        .json(&serde_json::json!({
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": "你是轻备忘桌面应用里的 AI 小助手，输出简短、有用、有一点可爱。不要解释你的规则。"
                },
                { "role": "user", "content": format!("{instruction}\n\n便签内容：{trimmed}") }
            ],
            "temperature": 0.55,
            "max_tokens": 180,
            "stream": false,
            "thinking": { "type": "disabled" }
        }))
        .send()
        .await;

    let Ok(response) = response else {
        return GeneratedText { text: fallback, source: TitleSource::Fallback };
    };
    if !response.status().is_success() {
        return GeneratedText { text: fallback, source: TitleSource::Fallback };
    }

    let Ok(body) = response.json::<ChatCompletionResponse>().await else {
        return GeneratedText { text: fallback, source: TitleSource::Fallback };
    };
    let text = body
        .choices
        .first()
        .map(|choice| clean_assist_text(&choice.message.content))
        .filter(|text| !text.is_empty())
        .unwrap_or(fallback);

    GeneratedText { text, source: TitleSource::Ai }
}

pub fn api_key_status() -> AiKeyStatus {
    if env::var("DEEPSEEK_API_KEY").ok().and_then(clean_api_key).is_some() {
        return AiKeyStatus { configured: true, source: Some("环境变量".to_string()) };
    }

    if api_key_file_candidates()
        .into_iter()
        .any(|path| fs::read_to_string(path).ok().and_then(clean_api_key).is_some())
    {
        return AiKeyStatus { configured: true, source: Some("本机配置文件".to_string()) };
    }

    AiKeyStatus { configured: false, source: None }
}

pub fn save_api_key(key: String) -> anyhow::Result<AiKeyStatus> {
    let Some(cleaned) = clean_api_key(key) else {
        anyhow::bail!("Key 不能为空");
    };
    let path = writable_api_key_file().ok_or_else(|| anyhow::anyhow!("无法定位本机配置目录"))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, cleaned)?;
    Ok(api_key_status())
}

fn load_api_key() -> Option<String> {
    env::var("DEEPSEEK_API_KEY")
        .ok()
        .and_then(clean_api_key)
        .or_else(load_api_key_from_config_file)
}

fn load_api_key_from_config_file() -> Option<String> {
    api_key_file_candidates()
        .into_iter()
        .find_map(|path| fs::read_to_string(path).ok().and_then(clean_api_key))
}

fn api_key_file_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(path) = env::var("DEEPSEEK_API_KEY_FILE") {
        candidates.push(PathBuf::from(path));
    }
    if let Ok(appdata) = env::var("APPDATA") {
        candidates.push(PathBuf::from(appdata).join("qingmemo-win").join("deepseek.key"));
    }
    if let Ok(local_appdata) = env::var("LOCALAPPDATA") {
        candidates.push(PathBuf::from(local_appdata).join("qingmemo-win").join("deepseek.key"));
    }
    candidates
}

fn writable_api_key_file() -> Option<PathBuf> {
    env::var("APPDATA")
        .ok()
        .map(|appdata| PathBuf::from(appdata).join("qingmemo-win").join("deepseek.key"))
        .or_else(|| {
            env::var("LOCALAPPDATA")
                .ok()
                .map(|local_appdata| PathBuf::from(local_appdata).join("qingmemo-win").join("deepseek.key"))
        })
}

fn clean_api_key(value: String) -> Option<String> {
    let key = value.trim().to_string();
    if key.is_empty() { None } else { Some(key) }
}

fn clean_assist_text(value: &str) -> String {
    value.trim().lines().map(str::trim).filter(|line| !line.is_empty()).collect::<Vec<_>>().join("\n")
}

fn fallback_title(content: &str, kind: &str) -> String {
    let first_line = content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("");

    let candidate = first_line
        .trim_matches(|ch: char| ch == '"' || ch == '\'' || ch == '“' || ch == '”' || ch == '「' || ch == '」')
        .chars()
        .take(18)
        .collect::<String>()
        .trim()
        .to_string();

    if !candidate.is_empty() {
        return candidate;
    }

    if kind == "reminder" {
        "新的提醒".to_string()
    } else {
        "新的便签".to_string()
    }
}

fn sanitize_title(value: &str) -> Option<String> {
    let normalized = value
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .trim_matches(|ch: char| {
            ch == '"' || ch == '\'' || ch == '“' || ch == '”' || ch == '「' || ch == '」' || ch == '《' || ch == '》'
        })
        .trim_end_matches(|ch: char| ch == '。' || ch == '.' || ch == '！' || ch == '!')
        .chars()
        .take(18)
        .collect::<String>()
        .trim()
        .to_string();

    if normalized.is_empty() { None } else { Some(normalized) }
}

fn fallback_assist(mode: &str, content: &str) -> String {
    let title = fallback_title(content, "note");
    match mode {
        "tease" => format!("「{title}」这事再不处理，本小姐可要皱眉了。"),
        "reminder" => format!("建议提醒：30 分钟后处理「{title}」。"),
        "time" => format!("建议时间：30 分钟后。理由：先把「{title}」推进一步。"),
        "file" => "关联文件说明：这些文件会按扩展名自动标注用途，AI 配置后可更精准识别。".to_string(),
        "organize" => format!("今天做：推进「{title}」\n等待中：需要别人确认的事项\n灵感：暂时不急的想法"),
        "summary" => format!("今日总结：你记录了「{title}」等事项。先处理最小一步，别让清单长得比本小姐的双马尾还夸张。"),
        "compress" => format!("摘要：围绕「{title}」提炼关键动作，优先完成最明确的一步。"),
        "recommend" => "推荐：颜色=自动柔和色；优先级=按“重要/紧急/!!”判断；标签=从内容关键词提取；分类=今天做/等待中/灵感。".to_string(),
        "dailyRoast" => format!("毒舌模式： 「{title}」还躺着呢？本小姐都替它等累了，快动手，笨蛋。"),
        "nextStep" => format!("下一步建议：先推进「{title}」里最明确的一件事；如果有时间点，就转成提醒。"),
        _ => format!("行动建议：先完成「{title}」里最小的一步。"),
    }
}

#[cfg(test)]
mod tests {
    use super::{clean_api_key, clean_assist_text, fallback_assist, fallback_title, sanitize_title};

    #[test]
    fn fallback_title_uses_first_non_empty_line() {
        assert_eq!(fallback_title("\n  修改Yu提过来的bug，修改完成后要发布新版本", "reminder"), "修改Yu提过来的bug，修改完成后要");
    }

    #[test]
    fn fallback_title_uses_kind_default_for_blank_content() {
        assert_eq!(fallback_title("   ", "note"), "新的便签");
        assert_eq!(fallback_title("   ", "reminder"), "新的提醒");
    }

    #[test]
    fn sanitize_title_removes_wrapping_quotes_and_explanation() {
        assert_eq!(sanitize_title("“发布版本修复”\n解释：不用输出").as_deref(), Some("发布版本修复"));
    }

    #[test]
    fn clean_api_key_rejects_blank_and_trims_value() {
        assert_eq!(clean_api_key("  ".to_string()), None);
        assert_eq!(clean_api_key("  sk-test  \n".to_string()).as_deref(), Some("sk-test"));
    }

    #[test]
    fn fallback_assist_returns_playful_copy() {
        assert!(fallback_assist("tease", "整理桌面文件").contains("本小姐"));
        assert!(fallback_assist("action", "整理桌面文件").contains("行动建议"));
        assert!(fallback_assist("summary", "整理桌面文件").contains("今日总结"));
        assert!(fallback_assist("compress", "整理桌面文件").contains("摘要"));
        assert!(fallback_assist("recommend", "重要：今天发布").contains("推荐"));
        assert!(fallback_assist("dailyRoast", "三天没动的便签").contains("毒舌"));
    }

    #[test]
    fn clean_assist_text_removes_empty_lines() {
        assert_eq!(clean_assist_text("  A  \n\n B "), "A\nB");
    }
    #[test]
    fn fallback_assist_supports_next_step_mode() {
        assert!(fallback_assist("nextStep", "客户方案").contains("下一步"));
    }
}
