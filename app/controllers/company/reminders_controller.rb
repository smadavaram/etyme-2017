class Company::RemindersController < Company::BaseController

  def create
    @reminder = current_user.reminders.new(reminder_params)
    if @reminder.save
      flash[:success] = "Reminder Created Successfully!"
    else
      flash[:errors] = @reminder.errors.full_messages
    end
    redirect_to :back
  end

  private

  def reminder_params
    params.require(:reminder).permit(:title,:reminderable_id,:reminderable_type ,:remind_at,:status)
  end
end
