const OpenAI = require("openai");
const axios = require("./axios");
const cache = require("./cache");
const env = require("./env");
const { log4js } = require("./logger");
const OpenAICommand = require("#models/OpenAICommand");
const providers = require("#models/providers");
const models = require("#models/models");
const modelTypes = require("#models/modelTypes");
const OpenAIChatPlainContentBuilder = require("#models/OpenAIChatPlainContentBuilder");
const OpenAIChatMultiContentBuilder = require("#models/OpenAIChatMultiContentBuilder");

const logger = log4js.getLogger("openai");

const getConfig = (provider, auth) => {
  switch (provider) {
    case providers.AZURE:
      return {
        apiKey: auth.apiKey,
        baseURL: auth.basePath,
        defaultHeaders: { "api-key": auth.apiKey },
        defaultQuery: {
          "api-version": auth.apiVersion,
        },
      };
    case providers.OPENAI:
      return {
        apiKey: auth.apiKey,
        baseURL: auth.basePath,
      };
    default:
      return {
        apiKey: auth.apiKey,
      };
  }
};

const getChatContentBuilder = (openAIConfig) => {
  // Only use multi content builder if
  // 1. multi is enabled and
  // 2. the model is a vision model
  const isMulti =
    openAIConfig.chat.enableMulti &&
    models.isMatchType(openAIConfig.chat.model, modelTypes.VISION);

  isMulti && logger.log("Enable Multimodal chat");

  return () => {
    if (isMulti) {
      return new OpenAIChatMultiContentBuilder({ httpClient: axios });
    }

    return new OpenAIChatPlainContentBuilder();
  };
};

console.log('Provider', env.openAI.provider);
console.log('Auth Base Path', env.openAI.auth.basePath);
console.log('Chat Model', env.openAI.chat.model);
console.log('Auth API Key', env.openAI.auth.apiKey);


const openAIApi = new OpenAI(getConfig(env.openAI.provider, env.openAI.auth));

const openAICommand = new OpenAICommand(openAIApi, cache, env.openAI);

// Log OpenAI configuration details
const apiKeyFirstFour = env.openAI.auth.apiKey ? env.openAI.auth.apiKey.substring(0, 4) : 'N/A';
logger.info(`OpenAI Configuration:
  - Provider: ${env.openAI.provider}
  - Model: ${env.openAI.chat.model}
  - BasePath: ${env.openAI.auth.basePath || 'Default'}
  - API Key (first 4 chars): ${apiKeyFirstFour}
`);

module.exports = {
  openAICommand,
  getContentBuilderInstance: getChatContentBuilder(env.openAI),
};
