import mongoose, { Schema, Document } from 'mongoose';

export interface IJob extends Document {
  externalId: string;
  sourceUrl: string;
  title: string;
  company: string;
  location: string;
  jobType: string;
  description: string;
  content: string;
  link: string;
  imageUrl?: string;
  publishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<IJob>(
  {
    externalId: { type: String, required: true, unique: true }, // unique job ID from feed
    sourceUrl: { type: String, required: true },
    title: { type: String, required: true },
    company: { type: String, required: true },
    location: { type: String, default: '' },
    jobType: { type: String, default: '' },
    description: { type: String, default: '' },
    content: { type: String, default: '' },
    link: { type: String, required: true },
    imageUrl: { type: String },
    publishedAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  }
);

// additional indexes for common queries
jobSchema.index({ company: 1 });
jobSchema.index({ publishedAt: -1 });

export const Job = mongoose.model<IJob>('Job', jobSchema);
