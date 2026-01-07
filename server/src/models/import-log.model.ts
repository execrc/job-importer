import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IImportError {
  externalId?: string;
  title?: string;
  reason: string;
  errorType: 'validation' | 'database' | 'parse' | 'network' | 'unknown';
}

export interface IImportLog {
  _id: Types.ObjectId;
  feedUrl: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  totalFetched: number;
  newJobs: number;
  updatedJobs: number;
  failedJobs: number;
  importErrors: IImportError[];
  createdAt: Date;
  updatedAt: Date;
}

const importLogSchema = new Schema<IImportLog>(
  {
    feedUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date },
    totalFetched: { type: Number, default: 0 },
    newJobs: { type: Number, default: 0 },
    updatedJobs: { type: Number, default: 0 },
    failedJobs: { type: Number, default: 0 },
    importErrors: [
      {
        externalId: String,
        title: String,
        reason: { type: String, required: true },
        errorType: {
          type: String,
          enum: ['validation', 'database', 'parse', 'network', 'unknown'],
          default: 'unknown',
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// indexes for pagination and filtering
importLogSchema.index({ createdAt: -1 });
importLogSchema.index({ feedUrl: 1, createdAt: -1 });
importLogSchema.index({ status: 1 });

export const ImportLog = mongoose.model<IImportLog>('ImportLog', importLogSchema);
