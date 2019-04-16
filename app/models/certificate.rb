class Certificate < ActiveRecord::Base
  belongs_to :candidate
  has_many :candidate_certificate_documents

  accepts_nested_attributes_for :candidate_certificate_documents, reject_if: :all_blank, allow_destroy: true
end