class CompanyCandidateDoc < ApplicationRecord
  has_many :document_signs, as: :documentable,dependent: :destroy
  scope :jobs_docs, -> {where(title_type: "Job")}
end
