module Company::ActivitiesHelper

  def company_activities
    @activities.where("activities.owner_id = #{current_company.id} or activities.recipient_id = #{current_company.id} ")
  end
end
