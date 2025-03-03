const Enum = require("@5x/enumjs");
const modelTypes = require("./modelTypes");

const models = new Enum();
// Inflection AI Pi 3.0
// * inflection-3.0
models.defineEnumProperty("INFLECTION_3_0", "inflection-3.0", {
  types: [modelTypes.CHAT],
});

// Inflection AI Productivity 3.0 With Tools Calling
// * inflection-3.0-productivity
models.defineEnumProperty("INFLECTION_3_0_PRODUCTIVITY", "inflection-3.0-productivity", {
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
