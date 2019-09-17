class Client < ActiveRecord::Base
  belongs_to :candidate
  has_one :designation, dependent: :destroy

  after_create :send_reference_mail
  before_create :generate_slug

  accepts_nested_attributes_for :designation, reject_if: :all_blank, allow_destroy: true

  def send_reference_mail
    Candidate::CandidateMailer.client_reference(refrence_email, candidate.full_name, id, slug_one).deliver! if refrence_email.present?
    Candidate::CandidateMailer.client_reference(refrence_two_email, candidate.full_name, id,slug_two).deliver! if refrence_two_email.present?
  end

  def generate_slug
    self.slug_one = SecureRandom.hex(5)
    self.slug_two = SecureRandom.hex(6)
  end

end