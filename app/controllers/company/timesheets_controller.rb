class Company::TimesheetsController < Company::BaseController

  include Company::ChangeRatesHelper
  before_action :find_timesheet , except: [:index]
  # before_action :received_timesheet , only: [:approve]
  # before_action :set_timesheets , only: [:index]

  before_action :authorized_user , only: [:show,:approve]

  add_breadcrumb "TIMESHEETS", :timesheets_path, options: { title: "TIMESHEETS" }

  include CandidateHelper
  include Company::ChangeRatesHelper

  def index
    @timesheets = current_company.timesheets.includes(contract: [:change_rates ,buy_contracts: [:company, :candidate]]).submitted_timesheets.paginate(page: params[:page], per_page: 10).order(id: :desc)

    # @rec_search = current_company.received_timesheets.search(params[:q])
    # @received_timesheets   = @rec_search.result(distinct: true).paginate(page: params[:page], per_page: 10) || []
  end

  def approved
    @timesheets = current_company.timesheets.approved_timesheets.paginate(page: params[:page], per_page: 10).order(id: :desc)
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
    @timesheet.update_attributes(status: 'open')
    @timesheet.retire_on_reject_seq
    flash[:errors] = 'Timesheet rejected !'
    redirect_back fallback_location: root_path
    # if current_user.timesheet_approvers.create!(timesheet_id: @timesheet.id , status: Timesheet.statuses[:rejected].to_i)
    #   @timesheet.rejected!
    #   flash[:success] = "Successfully Approved"
    # else
    #   flash[:errors] = @timesheet.errors.full_messages
    # end
    # redirect_back fallback_location: root_path
  end

  def approve
    i = 0
    # if current_user.timesheet_approvers.create!(timesheet_id: @timesheet.id , status: Timesheet.statuses[:approved].to_i)
    rate = get_rate(@timesheet.start_date, @timesheet.contract_id, 'buy')
    if @timesheet.update_attributes(status: "approved", amount: rate*@timesheet.total_time)
      i += 1
      con_cycle = ContractCycle.find(@timesheet.ta_cycle_id)
      arr = Timesheet.where(ta_cycle_id: @timesheet.ta_cycle_id).pluck(:ta_cycle_id).uniq.compact.first

      total_count = Timesheet.where(ta_cycle_id: arr).count
      approved_count = Timesheet.where(ta_cycle_id: arr, status: 'approved').count
      if total_count == approved_count
        con_cycle.update_attributes(completed_at: Time.now, status: "completed")
      end


      # if con_cycle.end_date.utc.to_date-1.day == @timesheet.end_date
      #   con_cycle.update_attributes(completed_at: Time.now, status: "completed")
      # end
      # @timesheet.contract.invoice_generate(con_cycle)

      invoices = @timesheet.contract.invoices.where(invoice_type: 'timesheet_invoice').where("(start_date <= ? AND end_date >= ?) OR (start_date <= ? AND end_date >= ?)", @timesheet.start_date, @timesheet.start_date, @timesheet.end_date, @timesheet.end_date)
      invoices.each do |i|
        hours = 0
        if @timesheet.start_date >= i.start_date && @timesheet.end_date <= i.end_date
          i.update_attributes(total_approve_time: (i.total_approve_time+@timesheet.total_time), balance: (i.balance + (@timesheet.total_time * get_rate(@timesheet.start_date , @timesheet.contract_id, 'sell' ))))
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
      csca_accounts = CscAccount.where(contract_id: @timesheet.contract_id)
      # binding.pry
      csca_accounts.each do |csca|
        if csca.contract_sale_commision.limit.to_i > (csca.total_amount.to_i+@timesheet&.total_time*csca&.contract_sale_commision&.rate.to_i)
          # binding.pry
          csca.update(total_amount: (csca&.total_amount+@timesheet&.total_time*csca&.contract_sale_commision&.rate.to_i).to_i)
          csca.set_commission_on_seq(@timesheet&.total_time*csca&.contract_sale_commision&.rate.to_i)     
        else
          csca.set_commission_on_seq(csca.contract_sale_commision.limit.to_i - csca&.total_amount.to_i)
          csca.update(total_amount: (csca.contract_sale_commision.limit.to_i))
        end
      end


      # salaries = @timesheet.contract.salaries.where("(start_date <= ? AND end_date >= ?) OR (start_date <= ? AND end_date >= ?)", @timesheet.start_date, @timesheet.start_date, @timesheet.end_date, @timesheet.end_date)
      # salaries.each do |i|
      #   hours = 0
      #   if @timesheet.start_date >= i.start_date && @timesheet.end_date <= i.end_date
      #     i.update_attributes(total_approve_time: (i.total_approve_time+@timesheet.total_time), balance: (i.balance + (@timesheet.total_time * i.rate)))
      #     @timesheet.update(inv_numbers: (@timesheet.inv_numbers+[i.id]))
      #   else
      #     @timesheet.days.each do |t|
      #       if i.start_date <= t[0] && t[0] <= i.end_date
      #         hours += t[1].to_i
      #       end
      #     end
      #     i.update(total_approve_time: (i.total_approve_time+hours))
      #   end
      # end

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


      @timesheet.set_ta_on_seq
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
      @timesheets = current_company.timesheets.includes(contract: :sell_contract).approved_timesheets.invoice_timesheets(@invoice)
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
    sell_contract = contract.sell_contract
    get_next_date(Time.now, sell_contract.invoice_terms_period, sell_contract.invoice_date_1, sell_contract.invoice_date_2, sell_contract.invoice_end_of_month, sell_contract.invoice_day_of_week, (last_invoice.present? ? last_invoice.end_date : contract.start_date))
  end

end
