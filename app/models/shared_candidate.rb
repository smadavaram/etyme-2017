class SharedCandidate < ApplicationRecord
  belongs_to :candidate, optional: true
  belongs_to :shared_by, class_name: "Company", optional: true
  belongs_to :shared_to, class_name: "Company", optional: true

  validates_uniqueness_of :candidate_id, scope: [:shared_to_id, :shared_by_id]

end
