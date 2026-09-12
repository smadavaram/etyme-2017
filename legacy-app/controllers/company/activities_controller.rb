# frozen_string_literal: true

class Company::ActivitiesController < Company::BaseController
  add_breadcrumb 'Activities', :activities_path, title: 'Company Activities'
  def index
    @activities = PublicActivity::Activity.where('activities.owner_id = ? or activities.recipient_id = ?', current_company.id, current_company.id).order('created_at desc')
  end
  helper_method :current_user
  # hide_action :current_user
end
