class Company::ActivitiesController < Company::BaseController
  add_breadcrumb "Activities", :activities_path, :title => "Company Activities"
  def index
    @activities = PublicActivity::Activity.order("created_at desc")

  end
  helper_method :current_user
  # hide_action :current_user
end
