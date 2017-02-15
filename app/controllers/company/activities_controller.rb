class Company::ActivitiesController < Company::BaseController
  def index
    @activities = PublicActivity::Activity.order("created_at desc")
  end
  hide_action :current_user
end
