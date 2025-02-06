const EVENTS = [
  "appMention",
  "ask",
  "fate",
  "generateEvents",
  "message",
  "summarize",
];

const generateEvents = () => {
  EVENTS.map((event) => {
    require(`./${event}`);
  });
};

module.exports = generateEvents;
