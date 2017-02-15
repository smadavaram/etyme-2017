class Company::UsersController < Company::BaseController

  respond_to :js, :json, :html

  def dashboard
    add_breadcrumb "HOME", :dashboard_path
    @activities = PublicActivity::Activity.order("created_at desc")
  end # End of dashboard

  def update_photo
    render json: current_user.update_attribute(:photo, params[:photo])
    flash.now[:success] = "Photo Successfully Updated"
  end
  def show
  end
  def update
    if current_user.update_attributes!(user_params)
      flash[:success] = "User Updated"
      respond_with current_user
    else
      flash[:errors] = current_user.errors.full_messages
      redirect_to :back
    end
  end

  def notify_notifications
    @notifications = current_user.notifications || []
    render layout: false
  end

  private
  def user_params
    params.require(:user).permit(:first_name, :last_name,:dob,:email,:phone,:skills, :primary_address_id,:tag_list,
     address_attributes: [:id,:address1,:address2,:country,:city,:state,:zip_code]
    )
  end

end