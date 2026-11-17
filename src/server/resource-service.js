// Service pattern validates complete replacements and delegates persistence.
// Injecting the repository lets unit tests use a fake without a live database.
export class ResourceService {
  constructor(repository, schema) {
    this.repository = repository;
    this.schema = schema;
  }
  list(owner, page) {
    return this.repository.list(owner, page);
  }
  get(owner, id) {
    return this.repository.get(owner, id);
  }
  create(owner, input) {
    return this.repository.create(owner, this.schema.parse(input));
  }
  update(owner, id, input) {
    return this.repository.update(owner, id, this.schema.parse(input));
  }
  remove(owner, id) {
    return this.repository.remove(owner, id);
  }
}
