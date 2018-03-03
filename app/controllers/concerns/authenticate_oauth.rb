module AuthenticateOauth
  extend ActiveSupport::Concern

  def process_oauth
    if !@auth.present?
      flash[:error] = "Not able to authenticate user."
      return
    end
    @user = Candidate.find_by(email: @auth[:email])
    logger.info "Setting up oauth for #{@auth[:first_name]} #{@auth[:last_name]} with #{@auth[:provider]}"
    if @user.present?
      sign_in(:user, @user)
    else
      create_user_from_auth
    end
  end

  def create_user_from_auth
    logger.info "User #{@auth[:email]} does not exist, creating them from Auth attributes..."
    pass = ('a'..'z').to_a.shuffle[0,8].join
    @user = Candidate.new(email: @auth[:email], password: pass, password_confirmation: pass )
    @user.save!
  end
end