const Enum = require("@5x/enumjs");
const modelTypes = require("./modelTypes");

const models = new Enum();

// Groq Compatible Models
// DeepSeek Models
models.defineEnumProperty("DEEPSEEK_R1_DISTILL_LLAMA_70B", "deepseek-r1-distill-llama-70b", {
  types: [modelTypes.CHAT],
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
