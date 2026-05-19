//! 对 Anthropic 请求体做结构化关键词替换（system / messages / tools / model）

use serde_json::{Map, Value};

use crate::kiro::token_manager::MultiTokenManager;

use super::types::{CountTokensRequest, Message, MessagesRequest, SystemMessage, Tool};

/// 对 Messages 请求应用关键词替换（读取 TokenManager 内存配置）
pub fn apply_to_messages_request_with_manager(
    payload: &mut MessagesRequest,
    manager: &MultiTokenManager,
) {
    apply_to_messages_request(payload, |text| manager.apply_keyword_replacements_str(text));
}

/// 对 count_tokens 请求应用关键词替换（读取 TokenManager 内存配置）
pub fn apply_to_count_tokens_request_with_manager(
    payload: &mut CountTokensRequest,
    manager: &MultiTokenManager,
) {
    apply_to_count_tokens_request(payload, |text| manager.apply_keyword_replacements_str(text));
}

/// 对 Messages 请求应用关键词替换（system、全部 messages、tools、model）
fn apply_to_messages_request(payload: &mut MessagesRequest, replace: impl Fn(&str) -> String) {
    payload.model = replace(&payload.model);

    if let Some(ref mut system) = payload.system {
        apply_to_system_messages(system, &replace);
    }

    for msg in payload.messages.iter_mut() {
        apply_to_message(msg, &replace);
    }

    if let Some(ref mut tools) = payload.tools {
        apply_to_tools(tools, &replace);
    }
}

/// 对 count_tokens 请求应用关键词替换
fn apply_to_count_tokens_request(payload: &mut CountTokensRequest, replace: impl Fn(&str) -> String) {
    payload.model = replace(&payload.model);

    if let Some(ref mut system) = payload.system {
        apply_to_system_messages(system, &replace);
    }

    for msg in payload.messages.iter_mut() {
        apply_to_message(msg, &replace);
    }

    if let Some(ref mut tools) = payload.tools {
        apply_to_tools(tools, &replace);
    }
}

fn apply_to_system_messages(system: &mut [SystemMessage], replace: &impl Fn(&str) -> String) {
    for item in system.iter_mut() {
        item.text = replace(&item.text);
    }
}

fn apply_to_tools(tools: &mut [Tool], replace: &impl Fn(&str) -> String) {
    for tool in tools.iter_mut() {
        tool.name = replace(&tool.name);
        tool.description = replace(&tool.description);
    }
}

fn apply_to_message(msg: &mut Message, replace: &impl Fn(&str) -> String) {
    apply_to_message_content(&mut msg.content, replace);
}

fn apply_to_message_content(content: &mut Value, replace: &impl Fn(&str) -> String) {
    match content {
        Value::String(s) => *s = replace(s),
        Value::Array(arr) => {
            for item in arr.iter_mut() {
                if let Value::Object(obj) = item {
                    apply_to_content_block(obj, replace);
                }
            }
        }
        _ => {}
    }
}

fn apply_to_content_block(obj: &mut Map<String, Value>, replace: &impl Fn(&str) -> String) {
    let block_type = obj
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if block_type == "image" {
        return;
    }

    replace_string_field(obj, "text", replace);
    replace_string_field(obj, "thinking", replace);

    if block_type.as_str() == "tool_result" {
        if let Some(content) = obj.get_mut("content") {
            apply_to_message_content(content, replace);
        }
    }

    if block_type.as_str() == "tool_use" {
        if let Some(input) = obj.get_mut("input") {
            apply_to_json_strings(input, replace);
        }
    }
}

fn replace_string_field(obj: &mut Map<String, Value>, key: &str, replace: &impl Fn(&str) -> String) {
    if let Some(Value::String(s)) = obj.get(key) {
        let replaced = replace(s);
        obj.insert(key.to_string(), Value::String(replaced));
    }
}

fn apply_to_json_strings(value: &mut Value, replace: &impl Fn(&str) -> String) {
    match value {
        Value::String(s) => *s = replace(s),
        Value::Array(arr) => {
            for item in arr.iter_mut() {
                apply_to_json_strings(item, replace);
            }
        }
        Value::Object(map) => {
            for v in map.values_mut() {
                apply_to_json_strings(v, replace);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::anthropic::types::Message;
    use serde_json::json;

    #[test]
    fn test_apply_system_and_string_message() {
        let mut payload = MessagesRequest {
            model: "CC-4.6".to_string(),
            max_tokens: 1024,
            messages: vec![Message {
                role: "user".to_string(),
                content: json!("hello Cursor"),
            }],
            stream: false,
            system: Some(vec![SystemMessage {
                text: "You are Cursor".to_string(),
            }]),
            tools: None,
            tool_choice: None,
            thinking: None,
            output_config: None,
            metadata: None,
        };

        apply_to_messages_request(&mut payload, |s| s.replace("Cursor", "Kiro"));

        assert_eq!(payload.model, "CC-4.6");
        assert_eq!(payload.system.as_ref().unwrap()[0].text, "You are Kiro");
        assert_eq!(payload.messages[0].content, json!("hello Kiro"));
    }

    #[test]
    fn test_apply_block_message_skips_image() {
        let mut payload = MessagesRequest {
            model: "claude".to_string(),
            max_tokens: 1024,
            messages: vec![Message {
                role: "user".to_string(),
                content: json!([
                    {"type": "text", "text": "see Cursor"},
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "CursorInImage"}}
                ]),
            }],
            stream: false,
            system: None,
            tools: None,
            tool_choice: None,
            thinking: None,
            output_config: None,
            metadata: None,
        };

        apply_to_messages_request(&mut payload, |s| s.replace("Cursor", "Kiro"));

        let arr = payload.messages[0].content.as_array().unwrap();
        assert_eq!(arr[0]["text"], "see Kiro");
        assert_eq!(arr[1]["source"]["data"], "CursorInImage");
    }
}
