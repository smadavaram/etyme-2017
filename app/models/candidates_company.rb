class CandidatesCompany < ApplicationRecord
  enum status: [:normal, :hot_candidate]
  enum candidate_status: [:pending, :accept, :reject]
  belongs_to :applicantable, polymorphic: true
  belongs_to :company, optional: true
end
