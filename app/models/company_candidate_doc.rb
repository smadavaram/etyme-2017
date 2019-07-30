class CompanyCandidateDoc < ApplicationRecord
  has_many :document_signs, as: :documentable,dependent: :destroy
end
