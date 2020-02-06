# frozen_string_literal: true

class Client < ActiveRecord::Base
  belongs_to :candidate
  has_one :designation, dependent: :destroy

  before_save :send_reference_mail

  accepts_nested_attributes_for :designation, reject_if: :all_blank, allow_destroy: true

  def send_reference_mail
    if !refrence_one.present? && refrence_email_changed?
      self.slug_one = SecureRandom.hex(5)
      Candidate::CandidateMailer.client_reference(refrence_email, candidate.full_name, id, slug_one).deliver!
    end
    if !refrence_two.present? && refrence_two_email_changed?
      self.slug_two = SecureRandom.hex(6)
      Candidate::CandidateMailer.client_reference(refrence_two_email, candidate.full_name, id, slug_two).deliver!
    end
  end
end
