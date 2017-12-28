class SharedCandidate < ActiveRecord::Base
  belongs_to :candidate
  belongs_to :shared_by, class_name: "Company"
  belongs_to :shared_to, class_name: "Company"

  validates_uniqueness_of :candidate_id, scope: [:shared_to_id, :shared_by_id]

end
