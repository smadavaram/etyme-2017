module Company::ActivitiesHelper

  def company_activities
    @activities.where("activities.owner_id = #{current_company.id} or activities.recipient_id = #{current_company.id} ")
  end

  def company_activities_hash
    activity_h = {}
    @activities.where("activities.owner_id = #{current_company.id} or activities.recipient_id = #{current_company.id} ").take(5).each do |activity|
      activity_h[activity.created_at.to_date] ? activity_h[activity.created_at.to_date] << activity : activity_h[activity.created_at.to_date] = [activity]
    end
    activity_h
  end

  def candidate_activity_hash
    activity_h = {}
    @activities.where("activities.owner_id = #{current_candidate.id} or activities.recipient_id = #{current_candidate.id} ").take(5).each do |activity|
      activity_h[activity.created_at.to_date] ? activity_h[activity.created_at.to_date] << activity : activity_h[activity.created_at.to_date] = [activity]
    end
    activity_h
  end

  def contract_activity_hash(activities)
    activity_h = {}
    activities.each do |activity|
      activity_h[activity.created_at.to_date] ? activity_h[activity.created_at.to_date] << activity : activity_h[activity.created_at.to_date] = [activity]
    end
    activity_h
  end

  def job_application_activity_hash
    activity_h = {}
    @activities&.take(5).each do |activity|
      activity_h[activity.created_at.to_date] ? activity_h[activity.created_at.to_date] << activity : activity_h[activity.created_at.to_date] = [activity]
    end
    activity_h
  end

end
