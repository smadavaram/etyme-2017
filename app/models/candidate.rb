class Candidate < User

  #Callbacks
  after_create :welcome_candidate






  private

  # send welcome email to candidate
  def welcome_candidate
    CandidateMailer.welcome_candidate(self).deliver_now
  end

end
