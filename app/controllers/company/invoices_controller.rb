class Company::InvoicesController < Company::BaseController
  
  before_action :find_contract, only: [:show, :download, :index, :accept_invoice, :reject_invoice, :paid_invoice]
  before_action :find_invoice, only: [:show, :download, :accept_invoice, :reject_invoice, :paid_invoice]
  before_action :set_invoices, only: [:reject_invoice]
  # before_action :set_company_contract_invoices, only: [:index]
  before_action :authorized_user, only: [:index, :reject_invoice, :show]

  add_breadcrumb "Dashboard", :dashboard_path


  def index
    add_breadcrumb "Invoices", invoices_path
    @tab = params[:tab] || 'purchase'
    @receive_invoices = current_company.receive_invoices.where(status: [:submitted, :paid, :partially_paid, :cancelled]).joins(:contract).paginate(page: params[:page], per_page: 15)
    @sent_invoices = current_company.sent_invoices.where(status: [:open, :submitted, :paid, :partially_paid, :cancelled]).joins(:contract).paginate(page: params[:page], per_page: 15)
  end

  def sale
    @tab = params[:tab]||'all_invoices'
    @start_date  = params[:start_date]
    @end_date  = params[:end_date]

    add_breadcrumb @tab.eql?('all_invoices')? @tab : "#{@tab} Invoice(s)", '#', options: {title: "INVOICES"}
    if @start_date.present? && @end_date.present?
      @sent_invoices = current_company.sent_invoices.send(@tab.to_s).where('invoices.start_date > ? AND invoices.end_date < ?', @start_date, @end_date).joins(:contract).paginate(page: params[:page], per_page: 15)
    else
      @sent_invoices = current_company.sent_invoices.send(@tab.to_s).joins(:contract).paginate(page: params[:page], per_page: 15)
    end
  end

  
  def purchase
    @tab = params[:tab] ||  'all_invoices'
    @start_date  = params[:start_date]
    @end_date  = params[:end_date]
    add_breadcrumb @tab.eql?('all_invoices') ? @tab : "#{@tab} Invoice(s)", '#'
    if @start_date.present? && @end_date.present?
      @receive_invoices = current_company.receive_invoices.send(@tab.to_s).where('invoices.start_date > ? AND invoices.end_date < ?', @start_date, @end_date).joins(:contract).paginate(page: params[:page], per_page: 15)

    else
      @receive_invoices = current_company.receive_invoices.send(@tab.to_s).joins(:contract).paginate(page: params[:page], per_page: 15)

    end

  end

  def cleared_invoice
    @invoices = Invoice.cleared_invoices.joins(:contract).where(contracts: {company_id: current_company.id}).order("created_at DESC")
    render 'index'
  end
  
  def client_submit_invoice
    @timesheets = Timesheet.where(id: params[:ids])
    @contract = @timesheets.first.contract_cycle.contract
    @invoice = @contract.invoices.timesheet_invoice.open.new(submitted_by: current_user, sender_company_id: current_user.company.id, receiver_company_id: @contract.sell_contract.company.id,
                                                             total_amount: @timesheets.sum(:amount), total_approve_time: @timesheets.sum(:total_time), start_date: Date.today, end_date: Date.today + 1.month)
    if @invoice.save
      @timesheets.each do |ts|
        @invoice.invoice_items.build(itemable: ts).save
      end
    else
      flash[:errors] = @invoice.errors.full_messages
    end
    redirect_back(fallback_location: root_path)
  end
  
  def submit_invoice
    @invoice = Invoice.where(id: params[:id]).first
    if @invoice.submitted!
      flash[:success] = "Successfully Submitted"
    else
      flash[:errors] = ["Unable to submit this Invoice."]
    end
    redirect_back fallback_location: invoices_path
  end
  
  def accept_invoice
    # if current_user.is_admin?
    #     @invoice.submitted!
    #     @invoice.submitted_by = current_user
    #     @invoice.submitted_on = DateTime.now
    #   if @invoice.save
    #   flash[:success] = "Successfully Submitted"
    # else
    #   flash[:errors] = "You are Not authorized to Submitt this Invoice. "
    #   end
    # end
    # redirect_back fallback_location: root_path
    
    if @invoice.total_approve_time <= 0 || @invoice.rate <= 0
      flash[:errors] = "Invoice not contains any amount. "
    else
      @invoice.open!
      @invoice.submitted_by = current_user
      @invoice.submitted_on = DateTime.now
      @invoice.total_amount = (@invoice.total_approve_time * @invoice.rate)
      if @invoice.save
        @invoice.set_seq_accept_in
        flash[:success] = "Successfully Submitted"
      else
        flash[:errors] = "You are Not authorized to Submitt this Invoice. "
      end
    end
    redirect_back fallback_location: root_path
  end
  
  def paid_invoice
    if @invoice.total_approve_time <= 0 || @invoice.rate <= 0
      flash[:errors] = "Invoice not contains any amount. "
    else
      @invoice.paid!
      
      if @invoice.save
        @invoice.set_seq_paid_in
        flash[:success] = "Successfully Paid"
      else
        flash[:errors] = "You are Not authorized to Submitt this Invoice. "
      end
    end
    redirect_back fallback_location: root_path
  end
  
  def reject_invoice
    if @contract.assignee == current_user
      @invoice.cancelled!
      @invoice.submitted_by = current_user
      @invoice.submitted_on = DateTime.now
      if @invoice.save
        flash[:success] = "Successfully Cancelled"
      else
        flash[:errors] = "You are Not authorized to Cancel this Invoice. "
      end
    end
    redirect_back fallback_location: root_path
  end
  
  def show
    @timesheet_logs = find_child_invoice_timesheet_logs(@invoice)
    respond_to do |format|
      format.html
      format.pdf do
        render pdf: @contract.title,
               file: Rails.root.join('app/views/company/invoices/show.html.haml'),
               orientation: 'Landscape', encoding: 'UTF-8',
               disposition: 'attachment',
               layout: 'company',
               title: @contract.title
      end
    end
  end
  
  def download
    html = render_to_string(:layout => false)
    pdf = WickedPdf.new.pdf_from_string(html)
    send_data(pdf, :filename => "#{@contract.title}.pdf", :type => "application/pdf", :disposition => 'attachment')
  end
  
  def authorized_user
    has_access?("manage_invoices")
  end
  
  def edit
    @invoice = Invoice.find(params[:id])
    @timesheets = current_user.timesheets.approved.where.not(id: @invoice.timesheets)
  end
  
  def client_expense_invoice
    @invoice = Invoice.find(params[:id])
    @client_expenses = ClientExpense.approved.joins(:contract_cycle).where.not(id: @invoice.client_expenses).where("contract_cycles.contract_id": current_company.contracts.ids, "contract_cycles.cycle_of_type": "SellContract")
  end
  
  def update_expense_invoice
    @invoice = Invoice.find(params[:id])
    @client_expenses = ClientExpense.where(id: params[:ids])
    ClientExpense.transaction do
      @client_expenses.each do |ce|
        @invoice.invoice_items.build(itemable: ce).save
      end
      @invoice.open! if @invoice.pending_invoice?
    end
    flash[:success] = 'Updated Successfully'
    redirect_to invoices_path(tab: "sent_invoices")
  end
  
  def update
    @invoice = Invoice.find(params[:id])
    @timesheets = Timesheet.where(id: params[:ids])
    Invoice.transaction do
      @timesheets.each do |ts|
        @invoice.invoice_items.build(itemable: ts).save
      end
      @invoice.open! if @invoice.pending_invoice?
    end
    flash[:success] = 'Updated Successfully'
    redirect_to invoices_path(tab: "sent_invoices")
  end
  
  private
    
    def set_invoice_timesheets(inv)
      timesheets = inv.contract.timesheets.approved_timesheets.where("start_date <= ? AND end_date <= ?", inv.start_date, inv.end_date)
      
      total_amount = 0
      total_approve_time = 0
      payrate = inv.contract.buy_contract.payrate
      
      timesheets.each do |t|
        t.days.each_key do |k|
          if (inv.start_date <= k.to_date && inv.end_date >= k.to_date)
            total_amount += t.days[k].to_i * payrate
            total_approve_time += t.days[k].to_i
          end
        end
      end
      inv.total_amount = total_amount,
          inv.total_approve_time = total_approve_time,
          inv.rate = payrate
      inv.save
    end
    
    def find_contract
      # @contract = current_company.sent_contracts.find(params[:contract_id])
      @contract = Contract.find_sent_or_received(params[:contract_id], current_company).first || []
    end
    
    def find_invoice
      @invoice = @contract.invoices.includes(timesheets: [timesheet_logs: [:transactions, :contract_term]]).find(params[:id])
      # if  !@contract.is_sent?(current_company)
      #
      # elsif  not (@invoice.submitted? && @contract.is_sent?(current_company))
      #   flash[:errors] = "Invoice is not submitted by Responde"
      #   redirect_to contract_invoices_path(@contract)
      # end
    end
    
    def set_invoices
      @invoices = @contract.invoices || []
    end
    
    def set_company_contract_invoices
      if params['contract_id'].present?
        @invoices = @contract.invoices || []
      end
      @send_contract_invoices = current_company.sent_invoices
      @rec_contract_invoices = current_company.received_invoices
    end
    
    def find_child_invoice_timesheet_logs invoice
      return invoice.parent_invoice.present? ? find_child_invoice_timesheet_logs(invoice.parent_invoice) : invoice.timesheet_logs
    end

end
