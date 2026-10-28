-- Migration: 003_seed_schema_versions
-- Insert immutable schema versions for image-boxes-v1 and action-segments-v1.
-- version_hash is a placeholder sha; the real keccak256 is computed by the app.

INSERT INTO schema_versions (id, modality, schema_name, json_schema, label_list, version_hash)
VALUES
(
  'a0000000-0000-0000-0000-000000000001',
  'image',
  'image-boxes-v1',
  '{
    "type": "object",
    "required": ["task_id","asset_id","schema_version","boxes"],
    "properties": {
      "task_id":        {"type": "string"},
      "asset_id":       {"type": "string"},
      "schema_version": {"type": "string", "const": "image-boxes-v1"},
      "boxes": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["x","y","w","h","class"],
          "properties": {
            "x":          {"type": "number"},
            "y":          {"type": "number"},
            "w":          {"type": "number", "minimum": 1},
            "h":          {"type": "number", "minimum": 1},
            "class":      {"type": "string"},
            "confidence": {"type": "integer", "minimum": 1, "maximum": 5}
          }
        }
      },
      "answers": {"type": "object"}
    }
  }',
  ARRAY['cup','red_block','blue_block','hand','robot_arm','other'],
  'image-boxes-v1-placeholder-hash'
),
(
  'a0000000-0000-0000-0000-000000000002',
  'video',
  'action-segments-v1',
  '{
    "type": "object",
    "required": ["task_id","asset_id","schema_version","segments"],
    "properties": {
      "task_id":        {"type": "string"},
      "asset_id":       {"type": "string"},
      "schema_version": {"type": "string", "const": "action-segments-v1"},
      "segments": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["start_ms","end_ms","action_label","outcome","confidence"],
          "properties": {
            "start_ms":      {"type": "integer", "minimum": 0},
            "end_ms":        {"type": "integer", "minimum": 1},
            "action_label":  {"type": "string", "enum": ["reach","grasp","lift","place","inspect","recover","write","other"]},
            "object":        {"type": "string"},
            "outcome":       {"type": "string", "enum": ["success","partial","failure","unknown"]},
            "failure_reason":{"type": "string"},
            "confidence":    {"type": "integer", "minimum": 1, "maximum": 5}
          }
        }
      }
    }
  }',
  ARRAY['reach','grasp','lift','place','inspect','recover','write','other'],
  'action-segments-v1-placeholder-hash'
)
ON CONFLICT (version_hash) DO NOTHING;
