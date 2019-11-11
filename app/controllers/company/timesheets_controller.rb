class Company::TimesheetsController < Company::BaseController

  include Company::ChangeRatesHelper
  before_action :find_timesheet, except: [:index]
  # before_action :received_timesheet , only: [:approve]
  # before_action :set_timesheets , only: [:index]
  before_action :user_timesheet, only: [:submit_timesheet, :add_hrs, :approve, :reject]
  before_action :authorized_user, only: [:show, :approve]
  skip_before_action :verify_authenticity_token, only: [:client_timesheets]
  add_breadcrumb "TIMESHEETS", :timesheets_path, options: {title: "TIMESHEETS"}

  include CandidateHelper
  include Company::ChangeRatesHelper


  def client_timesheets
    @cycles = current_user.contract_cycles.where(cycle_type: 'TimesheetSubmit')
    @contracts = Contract.joins(:sell_contract).where(company: current_company)
    respond_to do |format|
      @timesheets = Timesheet.timesheet_by_frequency(
          params[:cycle_frequency].present? ? params[:cycle_frequency] : "weekly",
          current_user).send(params[:tab].present? ? params[:tab] : "open_timesheets"
      )
      format.html {
        @tab = params[:tab].present? ? params[:tab] : "open_timesheets"
      }
      format.js {
        @cycle_id = params[:cycle_id]
        @contract_id = params[:contract_id]
        @tab = params[:tab]
        if params[:cycle_frequency].present?
          @cycle_frequency = params[:cycle_frequency]
          @timesheets = Timesheet.timesheet_by_frequency(params[:cycle_frequency], current_user).send(@tab)
        elsif if_all?(params[:contract_id]) and if_all?(params[:cycle_id])
          @timesheets = current_user.timesheets.send(@tab)
        elsif params[:contract_id] != "all" and if_all?(params[:cycle_id])
          @timesheets = current_user.timesheets.send(@tab).where(id: current_user.contract_cycles.where(contract_id: params[:contract_id], cycle_type: 'TimesheetSubmit', cyclable_type: "Timesheet").pluck(:cyclable_id))
        elsif params[:cycle_id] != "all"
          @timesheets = current_user.timesheets.send(@tab).where(id: current_user.contract_cycles.where(id: params[:cycle_id], cyclable_type: "Timesheet").pluck(:cyclable_id))
        end
        @timesheets = @timesheets.paginate(page: params[:page], per_page: 10) unless @tab == "open_timesheets"
        @cycle_frequency = @timesheets&.first.contract_cycle.cycle_frequency if @timesheets.present?
      }
    end
  end

  def index
    @tab = params[:tab]
    @start_date = params[:start_date]
    @end_date = params[:end_date]
    @cycle_type = params[:ts_type]
    @ts_for = params[:ts_for].present? ? params[:ts_for] : "candidate"

    @timesheets = @ts_for == "candidate" ?
                      Timesheet.joins(:contract_cycle).where("contract_cycles.contract_id": current_company.contracts.ids, "contract_cycles.cycle_of_type": "BuyContract").includes(contract: [buy_contract: [:company, :candidate]]).send("#{@tab&.downcase || 'all'}_timesheets").joins(:contract_cycle).where('contract_cycles.cycle_frequency IN (?)', @cycle_type.present? ? ContractCycle.cycle_frequencies[@cycle_type.to_sym] : ContractCycle.cycle_frequencies.values).between_date(@start_date, @end_date).paginate(page: params[:page], per_page: 10).order(start_date: :asc) :
                      Timesheet.joins(contract_cycle: [contract: :sell_contract]).where("contract_cycles.contract_id": SellContract.all.select(:contract_id), "contract_cycles.cycle_of_type": "SellContract", "sell_contracts.company_id": current_company.id).includes(contract: [buy_contract: [:company, :candidate]]).send("#{@tab&.downcase || 'all'}_timesheets").joins(:contract_cycle).where('contract_cycles.cycle_frequency IN (?)', @cycle_type.present? ? ContractCycle.cycle_frequencies[@cycle_type.to_sym] : ContractCycle.cycle_frequencies.values).between_date(@start_date, @end_date).paginate(page: params[:page], per_page: 10).order(start_date: :asc)
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

  def add_hrs
    @transaction = @timesheet.transactions.find_by(id: params[:transaction_id])
    if @transaction.update(total_time: params[:total_hrs])
      render json: {status: "Hours added successfully"}, status: :ok
    else
      render json: {status: @transaction.errors.full_messages}, status: :unprocessable_entity
    end
  end

  def submit_timesheet
    @timesheet = Timesheet.find_by(id: params[:timesheet_id])
    if @timesheet.end_date <= DateTime.now
      if @timesheet.submitted
        flash[:status] = "Timesheet submitted successfully"
        params[:redirect_url].present? ? redirect_to(params[:redirect_url]) : redirect_back(fallback_location: root_path)
      else
        flash[:errors] = @timesheet.errors.full_messages
        redirect_back(fallback_location: root_path)
      end
    else
      flash[:errors] = ["You cannot submit the before time."]
      redirect_back(fallback_location: root_path)
    end
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
    @timesheet_approver = current_user.timesheet_approvers.new(timesheet_id: @timesheet.id, status: Timesheet.statuses[:submitted].to_i)
    if @timesheet_approver.save
      flash[:success] = "Successfully Submitted"
    else
      flash[:errors] = @timesheet_approver.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  def reject
    if @timesheet.open!
      flash[:success] = "Successfully Rejected The Timesheet"
    else
      flash[:errors] = ['Timesheet rejected !']
    end
    # @timesheet.retire_on_reject_seq
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
    if @timesheet.approved!
      @timesheet.contract_cycle.completed!
      @timesheet.set_cost_and_time
      if @timesheet.contract_cycle.cycle_of_type == "BuyContract" and @timesheet.contract.sell_contract.present?
        Timesheet.transaction do
          dup_ts = @timesheet.dup
          dup_ts.candidate = nil
          dup_ts.user = @timesheet.contract.admin_user
          dup_ts.status = :submitted
          if dup_ts.save
            dup_cc = @timesheet.contract_cycle.dup
            dup_cc.candidate = nil
            dup_cc.cyclable = dup_ts
            dup_cc.cycle_of = @timesheet.contract.sell_contract
            dup_cc.user = @timesheet.contract.admin_user
            if dup_cc.save
              @timesheet.transactions.each do |tt|
                dup_tt = tt.dup
                dup_tt.timesheet = dup_ts
                dup_tt.save
              end
            end
          end
        end
      end
      flash[:success] = "Successfully Approved The Timesheet"
    else
      flash[:errors] = @timesheet.errors.full_messages
    end
    redirect_back(fallback_location: root_path)
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
                              total_amount: (timesheets.pluck(:total_time).sum * (timesheet.contract.buy_contract.payrate)),
                              total_approve_time: timesheets.pluck(:total_time).sum, submitted_on: Time.now,
                              rate: timesheet.contract.buy_contract.payrate
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

  def user_timesheet
    @timesheet = Timesheet.find_by(id: params[:timesheet_id] || params[:id])
  end

  def find_timesheet
    @timesheet = Timesheet.find_sent_or_received(params[:id] || params[:timesheet_id], current_company)
  end

  def received_timesheet
    @timesheet = current_company.received_timesheets.find_by_id(params[:id] || params[:timesheet_id]) || []
  end

  def set_timesheets
    @search = current_company.timesheets.search(params[:q])
    @timesheets = @search.result(distinct: true).paginate(page: params[:page], per_page: 10) || []
    @rec_search = current_company.received_timesheets.search(params[:q])
    @received_timesheets = @rec_search.result(distinct: true).paginate(page: params[:page], per_page: 10) || []
  end

  def get_next_invoice_date(contract)
    last_invoice = contract.invoices.order("created_at DESC").first
    sell_contract = contract.sell_contract
    get_next_date(Time.now, sell_contract.invoice_terms_period, sell_contract.invoice_date_1, sell_contract.invoice_date_2, sell_contract.invoice_end_of_month, sell_contract.invoice_day_of_week, (last_invoice.present? ? last_invoice.end_date : contract.start_date))
  end

  def if_all?(value)
    value == "all"
  end
end
