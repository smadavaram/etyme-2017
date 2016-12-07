class Candidate::CandidateMailer < ApplicationMailer
  default from: "no-reply@etyme.com"

  def welcome_candidate(candidate)
    @candidate=candidate
    mail(to: @candidate.email,subject: "#{@candidate.full_name.titleize}  Welcome To Etyme")
  end

end
