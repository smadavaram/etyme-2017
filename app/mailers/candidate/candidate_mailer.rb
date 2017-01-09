class Candidate::CandidateMailer < ApplicationMailer

    default from: "no-reply@etyme.com"

    def welcome_candidate(candidate)
      @candidate = candidate
      mail(to: @candidate.email,subject: "#{@candidate.full_name.titleize}, Welcome To Etyme", from: "no-reply@etyme.com")
    end
    def invite_user(candidate,user)
      @candidate   = candidate
      @name         = @candidate.full_name
      @sender=user
      @link         = "http://#{@candidate.etyme_url}/users/invitation/accept?invitation_token=#{@candidate.raw_invitation_token}"
      mail(to: candidate.email,  subject: "#{@sender.full_name.titleize} Invited You to Etyme",from: "Etyme <no-reply@etyme.com>")
    end

end
