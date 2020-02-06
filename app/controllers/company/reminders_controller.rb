# frozen_string_literal: true

class Company::RemindersController < Company::BaseController
  def create
    @reminder = current_user.reminders.new(reminder_params)
    if @reminder.save
      flash[:success] = 'Reminder Created Successfully!'
    else
      flash[:errors] = @reminder.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  def create_bulk_candidates
    params[:candidates_ids].split(',').each do |c_id|
      current_company.candidates.find(c_id.to_i).reminders.create(title: params[:reminder][:title], remind_at: params[:reminder][:remind_at], user_id: current_user.id)
    end
    flash[:success] = 'Reminder Created.'
    redirect_back fallback_location: root_path
  end

  def create_bulk_companies
    params[:company_ids].split(',').each do |c_id|
      current_company.invited_companies.find_by(invited_company: c_id.to_i).invited_company.reminders.create(title: params[:reminder][:title], remind_at: params[:reminder][:remind_at], user_id: current_user.id)
    end
    flash[:success] = 'Reminder Created.'
    redirect_back fallback_location: root_path
  end

  private

  def reminder_params
    params.require(:reminder).permit(:title, :reminderable_id, :reminderable_type, :remind_at, :status)
  end
end
