# frozen_string_literal: true

module AuthenticateOauth
  extend ActiveSupport::Concern

  def process_oauth
    unless @auth.present?
      flash[:error] = 'Not able to authenticate user.'
      return
    end
    @user = Candidate.find_by(email: @auth[:email])
    logger.info "Setting up oauth for #{@auth[:first_name]} #{@auth[:last_name]} with #{@auth[:provider]}"
    if @user.present?
      cookies.permanent.signed[:candidateid] = @user.id
      sign_in(:candidate, @user)
    else
      create_user_from_auth
    end
  end

  def create_user_from_auth
    logger.info "User #{@auth[:email]} does not exist, creating them from Auth attributes..."
    pass = ('a'..'z').to_a.sample(8).join
    @user = Candidate.new(email: @auth[:email],
                          password: pass,
                          password_confirmation: pass,
                          first_name: @auth[:first_name],
                          last_name: @auth[:last_name],
                          photo: @auth[:profile_image])
    @user.save!
  end
end
