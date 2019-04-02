class Certificate < ActiveRecord::Base
  belongs_to :candidate
  has_many :candidate_certificate_document

  accepts_nested_attributes_for :candidate_certificate_document, reject_if: :all_blank, allow_destroy: true
end