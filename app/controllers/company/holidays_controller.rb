class Company::HolidaysController < ApplicationController
  before_action :set_holiday, only: [:destroy, :update]

  def index
    @holiday = current_company.holidays
  end

  def create
    @holiday = current_company.holidays.build(holiday_params)
    respond_to do |f|
      if @holiday.save
        f.html { redirect_to payroll_term_infos_path, success: "Holidays has been created" }
        f.json { render json: @holiday.as_json, status: :ok }
      else
        f.html { redirect_to payroll_term_infos_path, errors: @holiday.errors.full_messages }
        f.json { render json: {errors: @holiday.errors.full_messages, holiday: @holiday}.as_json, status: :unprocessable_entity }
      end
    end
  end

  def update
    respond_to do |f|
      if @holiday.update(holiday_params)
        f.html { redirect_to payroll_term_infos_path, success: "Holidays has been updated" }
        f.json { render json: @holiday.as_json, status: :ok }
      else
        f.html { redirect_to payroll_term_infos_path, errors: @holiday.errors.full_messages }
        f.json { render json: {errors: @holiday.errors.full_messages, holiday: @holiday}.as_json, status: :unprocessable_entity }
      end
    end
  end

  def destroy
    respond_to do |f|
      if @holiday.destroy
        flash[:success] = "Holidays has been destroyed"
        f.html { redirect_to payroll_term_infos_path }
        f.js {}
      else
        flash[:errors] = @holiday.errors.full_messages
        f.html { redirect_to payroll_term_infos_path }
        f.js {}
      end
    end
  end

  private

  def holiday_params
    params.require(:holiday).permit(:name, :date)
  end

  def set_holiday
    @holiday = current_company.holidays.find_by(id: params[:id])
  end

end