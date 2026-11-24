// Routing policy. The kind of data a step handles decides which inference mode
// it may use. Nothing else in the app chooses a mode.
import { InferenceMode } from 'firebase/ai';

export const DataClass = Object.freeze({
  ANSWERS: 'answers', // what respondents wrote
  QUESTION: 'question', // the survey question and context typed by the analyst
  TALLIES: 'tallies', // the counted sheet produced by buildOutbound()
  REPORT: 'report', // text written from the tallies
});

export function modeFor(dataClass, { confidential = true } = {}) {
  switch (dataClass) {
    case DataClass.ANSWERS:
      // Confidential answers can only be read by the local model. The SDK
      // throws instead of falling back, so a missing model can never turn
      // into an upload.
      return confidential ? InferenceMode.ONLY_ON_DEVICE : InferenceMode.PREFER_ON_DEVICE;
    case DataClass.QUESTION:
      return InferenceMode.PREFER_IN_CLOUD;
    case DataClass.TALLIES:
      return InferenceMode.ONLY_IN_CLOUD;
    case DataClass.REPORT:
      return InferenceMode.PREFER_ON_DEVICE;
    default:
      throw new Error(`Unknown data class: ${dataClass}`);
  }
}

export const ROUTES = Object.freeze({
  read: { data: DataClass.ANSWERS, cloudModel: 'light', label: 'Read an answer' },
  discover: { data: DataClass.ANSWERS, cloudModel: 'light', label: 'Find themes in a sample of answers' },
  suggest: { data: DataClass.QUESTION, cloudModel: 'light', label: 'Suggest themes from the question' },
  // The report is written in the cloud. If the cloud cannot be reached the
  // router records why and runs the on-device variant with its own shorter prompt.
  report: { data: DataClass.TALLIES, cloudModel: 'writing', quotaFallbackModel: 'writingFallback', deviceFallback: true, label: 'Write the report' },
  shorten: { data: DataClass.REPORT, cloudModel: 'light', label: 'Shorten the report' },
});
