class Client < ActiveRecord::Base
  belongs_to :candidate

  # after_create :send_reference_mail

  def send_reference_mail
    Candidate::CandidateMailer.client_reference(refrence_email, candidate.full_name).deliver!
  end

end