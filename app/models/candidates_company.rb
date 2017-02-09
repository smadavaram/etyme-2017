class CandidatesCompany < ActiveRecord::Base
  enum status: [:normal,:hot_candidate]
  belongs_to :candidate
  belongs_to :company
end
