import mongoose from 'mongoose';
import { AppError } from './errors.js';
// Repository pattern keeps MongoDB queries out of the business service.
// Every lookup includes owner; even admins cannot read another student's records.
export class OwnedRepository {
  constructor(model, sortField) {
    this.model = model;
    this.sortField = sortField;
  }
  list(owner, page = 1) {
    return this.model
      .find({ owner })
      .sort({ [this.sortField]: 1, _id: 1 })
      .skip((page - 1) * 50)
      .limit(50)
      .lean();
  }
  create(owner, data) {
    return this.model.create({ ...data, owner });
  }
  async get(owner, id) {
    this.checkId(id);
    const item = await this.model.findOne({ _id: id, owner }).lean();
    if (!item) throw new AppError(404, 'Record not found');
    return item;
  }
  async update(owner, id, data) {
    this.checkId(id);
    const item = await this.model
      .findOneAndUpdate({ _id: id, owner }, { $set: data }, { new: true, runValidators: true })
      .lean();
    if (!item) throw new AppError(404, 'Record not found');
    return item;
  }
  async remove(owner, id) {
    this.checkId(id);
    const item = await this.model.findOneAndDelete({ _id: id, owner });
    if (!item) throw new AppError(404, 'Record not found');
  }
  checkId(id) {
    if (!mongoose.isObjectIdOrHexString(id)) throw new AppError(400, 'Invalid record ID');
  }
}
