class Company::TimesheetsController < Company::BaseController

  before_action :find_timesheet , except: [:index]
  # before_action :received_timesheet , only: [:approve]
  # before_action :set_timesheets , only: [:index]

  before_action :authorized_user , only: [:show,:approve]

  add_breadcrumb "TIMESHEETS", :timesheets_path, options: { title: "TIMESHEETS" }

  include CandidateHelper

  def index
    @timesheets = current_company.timesheets.submitted_timesheets.paginate(page: params[:page], per_page: 10)

    # @rec_search = current_company.received_timesheets.search(params[:q])
    # @received_timesheets   = @rec_search.result(distinct: true).paginate(page: params[:page], per_page: 10) || []
  end

  def approved
    @timesheets = current_company.timesheets.approved_timesheets.paginate(page: params[:page], per_page: 10)
  end

  def show
  end

  def new
    @timesheet = current_user.timesheets.new
    @contracts = current_company.contracts.pluck(:number, :id)
  end

  def submit_timesheet
    @buy_contract = BuyContract.find(params[:timesheet_id])
    if @buy_contract.contract.timesheets.present?
      last_time = @buy_contract.contract.timesheets.order("created_at DESC").first
      @start_date = last_time.end_date + 1.days
      @end_date = @start_date + 7.days
    else
      @start_date = @buy_contract.contract.start_date
      @end_date = @buy_contract.first_date_of_timesheet
    end

    @timesheet = current_user.timesheets.new
    render 'new'
  end

  def create
    @timesheet = current_company.timesheets.new(timesheet_params)
    @timesheet.user_id = current_user.id
    @timesheet.days = params[:timesheet][:days]
    @timesheet.total_time = params[:timesheet][:days].values.map(&:to_i).sum
    if @timesheet.save
      flash[:success] = "Successfully Created"
      redirect_to timesheets_path
    else
      flash[:errors] = @timesheet.errors.full_messages
      redirect_to timesheets_path
    end
  end

  def submit
      @timesheet_approver = current_user.timesheet_approvers.new(timesheet_id: @timesheet.id , status: Timesheet.statuses[:submitted].to_i)
      if @timesheet_approver.save
        flash[:success] = "Successfully Submitted"
      else
        flash[:errors] = @timesheet_approver.errors.full_messages
      end
      redirect_back fallback_location: root_path
  end

  def reject
    if current_user.timesheet_approvers.create!(timesheet_id: @timesheet.id , status: Timesheet.statuses[:rejected].to_i)
      @timesheet.rejected!
      flash[:success] = "Successfully Approved"
    else
      flash[:errors] = @timesheet.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  def approve
    # if current_user.timesheet_approvers.create!(timesheet_id: @timesheet.id , status: Timesheet.statuses[:approved].to_i)

    if @timesheet.update_attributes(status: "approved")
      con_cycle = ContractCycle.find(@timesheet.ta_cycle_id)
      con_cycle.update_attributes(completed_at: Time.now, status: "completed")
      @timesheet.contract.invoice_generate

      invoices = @timesheet.contract.invoices.where("(start_date <= ? AND end_date >= ?) OR (start_date <= ? AND end_date >= ?)", @timesheet.start_date, @timesheet.start_date, @timesheet.end_date, @timesheet.end_date)
      invoices.each do |i|
        hours = 0
        if @timesheet.start_date >= i.start_date && @timesheet.end_date <= i.end_date
          i.update(total_approve_time: (i.total_approve_time+@timesheet.total_time))
          @timesheet.update(inv_numbers: (@timesheet.inv_numbers+[i.id]))
        else
          @timesheet.days.each do |t|
            if i.start_date <= t[0] && t[0] <= i.end_date
              hours += t[1].to_i
            end
          end
          i.update(total_approve_time: (i.total_approve_time+hours))
          @timesheet.update(inv_numbers: (@timesheet.inv_numbers+[i.id]))
        end
      end

      # @timesheet.contract.invoices.where("start_date <= ? AND end_date >= ?", self.start_date, self.start_date )
      # timesheets = self.contract.timesheets.where("start_date >= ? AND start_date <= ?", self.start_date, self.end_date )
      # hours = 0
      # timesheets.each do |t|
      #   if t.start_date >= self.start_date && t.end_date <= self.end_date
      #     hours += t.total_time
      #     t.update(inv_numbers: (t.inv_numbers+[t.id]))
      #   else
      #     # t.days.each
      #   end
      # end


      flash[:success] = "Successfully Approved"
    else
      flash[:errors] = @timesheet.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  def authorized_user
    has_access?("manage_timesheets")
  end

  def check_invoice
    @invoice = Invoice.where(id: (params[:id] || params[:timesheet_id])).first
    if @invoice.present?
      @timesheets = current_company.timesheets.approved_timesheets.where("start_date >= ? AND end_date <= ?", @invoice.start_date, @invoice.end_date)
    else
      @errors = true
    end
  end

  def generate_invoice
    timesheet = current_company.timesheets.approved_timesheets.where(id: (params[:id] || params[:timesheet_id])).first
    if timesheet.present?
      timesheets = timesheet.contract.timesheets.approved_timesheets.where(invoice_id: nil)
      if timesheets.present?
        min_date = timesheets.minimum(:start_date)
        max_date = timesheets.maximum(:end_date)

        invoice = Invoice.new(contract_id: timesheet.contract_id, start_date: min_date, end_date: max_date,
                              total_amount: (timesheets.pluck(:total_time).sum * (timesheet.contract.buy_contracts.first.payrate)),
                              total_approve_time: timesheets.pluck(:total_time).sum, submitted_on: Time.now,
                              rate: timesheet.contract.buy_contracts.first.payrate
        )
        if invoice.save
          timesheets.update_all(invoice_id: invoice.id)
          flash[:sucess] = "Invoice Generated successfully."
        else
          flash[:errors] = invoice.errors.full_messages
        end
      else
        flash[:errors] = ["There is no approve timesheets."]
      end
    else
      flash[:errors] = ["Invlid Timesheet."]
    end

    redirect_to approved_timesheets_path
  end

  private

  def timesheet_params
    params.require(:timesheet).permit(:job_id, :user_id, :company_id, :contract_id, :status, :total_time, :start_date, :end_date, :submitted_date, :next_timesheet_created_date, :invoice_id, :timesheet_attachment)
  end

  def find_timesheet
    @timesheet = Timesheet.find_sent_or_received(params[:id] || params[:timesheet_id] , current_company)
  end

  def received_timesheet
    @timesheet = current_company.received_timesheets.find_by_id(params[:id] || params[:timesheet_id]) || []
  end

  def set_timesheets
    @search = current_company.timesheets.search(params[:q])
    @timesheets       = @search.result(distinct: true).paginate(page: params[:page], per_page: 10) || []
    @rec_search = current_company.received_timesheets.search(params[:q])
    @received_timesheets   = @rec_search.result(distinct: true).paginate(page: params[:page], per_page: 10) || []
  end

  def get_next_invoice_date(contract)
    last_invoice = contract.invoices.order("created_at DESC").first
    sell_contract = contract.sell_contracts.first
    get_next_date(Time.now, sell_contract.invoice_terms_period, sell_contract.invoice_date_1, sell_contract.invoice_date_2, sell_contract.invoice_end_of_month, sell_contract.invoice_day_of_week, (last_invoice.present? ? last_invoice.end_date : contract.start_date))
  end

end
