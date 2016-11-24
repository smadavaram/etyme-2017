class Company::UsersController < Company::BaseController

  respond_to :js, :json, :html
  # Dashboard after HiringManager/Vendor login
  # add_breadcrumb :root_name, "/"



  def dashboard
    add_breadcrumb "HOME", :dashboard_path
  end # End of dashboard

  def update_photo
    render json: current_user.update_attribute(:photo, params[:photo])
    flash.now[:success] = "Photo Successfully Updated"
  end


  private
  def user_params
    params.require(:user).permit(:photo)
  end

end