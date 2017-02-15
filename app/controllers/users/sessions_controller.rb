class Users::SessionsController < Devise::SessionsController
# before_action :configure_sign_in_params, only: [:create]

  layout 'landing'
  add_breadcrumb "Home",'/'
  add_breadcrumb "Company",""
  add_breadcrumb "Sign In",''
  # before_action :check_company_user ,only: [:create]

  # GET /resource/sign_in
  def new
     super
   end

  # POST /resource/sign_in
   def create
     if check_company_user
      super
     else
       flash[:error] = "User is not registerd on this domain"
       redirect_to :back
     end

   end

  # DELETE /resource/sign_out
   def destroy
     super
   end

  # protected

  # If you have extra params to permit, append them to the sanitizer.
  # def configure_sign_in_params
  #   devise_parameter_sanitizer.permit(:sign_in, keys: [:attribute])
  # end

  private

  def check_company_user
   current_company.users.find_by(email: params[:user][:email]).present?
  end
end
