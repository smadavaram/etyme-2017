class CandidatesCompany < ApplicationRecord
  enum status: [:normal,:hot_candidate]
  belongs_to :candidate, optional: true
  belongs_to :company, optional: true
end
