class Company::RemindersController < Company::BaseController

  def create
    @reminder = current_user.reminders.new(reminder_params)

    respond_to do |format|
      if @reminder.save
        format.js {
          @company_id = params[:reminder][:reminderable_id]
          flash[:success] = "Reminder has been created"
        }
      else
        flash[:alert] = @reminder.errors.full_messages
      end
    end
  end

  def create_bulk_candidates

    params[:candidates_ids].split(",").each do |c_id|
      current_company.candidates.find(c_id.to_i).reminders.create(title: params[:reminder][:title], remind_at: params[:reminder][:remind_at], user_id: current_user.id)
    end
    flash[:success] = "Reminder Created."
    redirect_back fallback_location: root_path
  end

  def create_bulk_companies
    params[:company_ids].split(',').each do |c_id|
      current_company.invited_companies.find_by(invited_company: c_id.to_i).invited_company.reminders.create(title: params[:reminder][:title], remind_at: params[:reminder][:remind_at], user_id: current_user.id)
    end
    flash[:success] = "Reminder Created."
    redirect_back fallback_location: root_path
  end


  private

  def reminder_params
    params.require(:reminder).permit(:title, :reminderable_id, :reminderable_type, :remind_at, :status)
  end
end
