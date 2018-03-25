class Candidates::OmniauthCallbacksController < Devise::OmniauthCallbacksController
  include AuthenticateOauth
  def facebook
    logger.info request.env["omniauth.auth"]
    @auth = {
        provider: request.env["omniauth.auth"].provider,
        uid: request.env["omniauth.auth"].uid,
        email: request.env["omniauth.auth"].info.email,
        token: request.env["omniauth.auth"].credentials.token,
        token_expires: request.env["omniauth.auth"].credentials.expired_at,
        first_name: request.env["omniauth.auth"].info.first_name,
        last_name: request.env["omniauth.auth"].info.last_name
    }

    if current_user && current_user.present?
      session[:token]=@auth[:token]
      redirect_to set_redirection(current_user)
    else
      process_oauth
      if @is_new_user
        render 'facebook', layout: 'user_type_layout'
      else
        redirect_to set_redirection(@user)
      end
    end
  end

  def google_oauth2
    logger.info request.env["omniauth.auth"]
    @auth = {
        provider: request.env["omniauth.auth"].provider,
        uid: request.env["omniauth.auth"].uid,
        email: request.env["omniauth.auth"].info.email,
        token: request.env["omniauth.auth"].credentials.token,
        token_expires: request.env["omniauth.auth"].credentials.expired_at,
        first_name: request.env["omniauth.auth"].info.first_name,
        last_name: request.env["omniauth.auth"].info.last_name
    }

    if current_user && current_user.present?
      session[:token]=@auth[:token]
      redirect_to set_redirection(current_user)
    else
      process_oauth
      if @is_new_user
        render 'facebook', layout: 'user_type_layout'
      else
        redirect_to set_redirection(@user)
      end
    end
  end

  def linkedin
    @auth = {
        provider: request.env["omniauth.auth"].provider,
        uid: request.env["omniauth.auth"].uid,
        email: request.env["omniauth.auth"].info.email,
        token: request.env["omniauth.auth"].credentials.token,
        token_expires: request.env["omniauth.auth"].credentials.expired_at,
        first_name: request.env["omniauth.auth"].info.first_name,
        last_name: request.env["omniauth.auth"].info.last_name,
        profile_image: request.env["omniauth.auth"].info.image
    }

    if current_user && current_user.present?
      session[:token]=@auth[:token]
      redirect_to set_redirection(current_user)
    else
      process_oauth

      if @is_new_user
        render 'facebook', layout: 'user_type_layout'
      else
        redirect_to set_redirection(@user)
      end
    end
  end

  def failure
    redirect_to root_path
  end

  def set_redirection(user)
    candidate_candidate_dashboard_path
  end
end
