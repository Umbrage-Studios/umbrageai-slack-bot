const Enum = require("@5x/enumjs");
const modelTypes = require("./modelTypes");

const models = new Enum();
// /v1/chat/completions:
// GPT-4o:
// * gpt-4o
models.defineEnumProperty("GPT_4O", "gpt-4o", {
  types: [modelTypes.CHAT, modelTypes.VISION],
});


// GPT-4o mini
// * gpt-4o-mini
models.defineEnumProperty("GPT_4O_MINI", "gpt-4o-mini", {
  types: [modelTypes.CHAT, modelTypes.VISION],
});

// o1:
// * o1
// * o1-mini
// * o3-mini
models.defineEnumProperty("O1", "o1", {
  types: [modelTypes.CHAT, modelTypes.VISION],
});
models.defineEnumProperty("O1_MINI", "o1-mini", {
  types: [modelTypes.CHAT, modelTypes.VISION],
});
models.defineEnumProperty("O3_MINI", "o3-mini", {
  types: [modelTypes.CHAT, modelTypes.VISION],
});


// /v1/embeddings:
// * text-embedding-3-large
// * text-embedding-3-small
// * text-embedding-ada-002
models.defineEnumProperty("TEXT_EMBEDDING_3_LARGE", "text-embedding-3-large", {
  types: [modelTypes.EMBEDDINGS],
});
models.defineEnumProperty("TEXT_EMBEDDING_3_SMALL", "text-embedding-3-small", {
  types: [modelTypes.EMBEDDINGS],
});
models.defineEnumProperty("TEXT_EMBEDDING_ADA_002", "text-embedding-ada-002", {
  types: [modelTypes.EMBEDDINGS],
});

// /v1/moderations:
// * omni-moderation-latest
// * omni-moderation-2024-09-26
// * text-moderation-latest
// * text-moderation-stable
// * text-moderation-007
models.defineEnumProperty("OMNI_MODERATION_LATEST", "omni-moderation-latest", {
  types: [modelTypes.MODERATIONS],
});
models.defineEnumProperty(
  "OMNI_MODERATION_2024_09_26",
  "omni-moderation-2024-09-26",
  {
    types: [modelTypes.MODERATIONS],
  }
);
models.defineEnumProperty("TEXT_MODERATION_LATEST", "text-moderation-latest", {
  types: [modelTypes.MODERATIONS],
});
models.defineEnumProperty("TEXT_MODERATION_STABLE", "text-moderation-stable", {
  types: [modelTypes.MODERATIONS],
});
models.defineEnumProperty("TEXT_MODERATION_007", "text-moderation-007", {
  types: [modelTypes.MODERATIONS],
});

const isValidModel = (model) => {
  return models.values().includes(model);
};

const isMatchType = (model, type) => {
  const props = models.getProp(model);
  const types = props?.types ?? [];

  return types.includes(type);
};

module.exports = models;
module.exports.isValidModel = isValidModel;
module.exports.isMatchType = isMatchType;
