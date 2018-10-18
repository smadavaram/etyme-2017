class Company::InvoicesController < Company::BaseController

  before_action :find_contract , only: [:show, :download , :index,:accept_invoice,:reject_invoice, :paid_invoice ]
  before_action :find_invoice , only: [:show, :download,:accept_invoice,:reject_invoice, :paid_invoice]
  before_action :set_invoices , only: [:reject_invoice]
  before_action :set_company_contract_invoices , only: [:index]
  before_action :authorized_user ,only: [:index, :reject_invoice,:show]

  add_breadcrumb "INVOICES", '#', options: { title: "INVOICES" }

  def index
    @invoices = Invoice.open_invoices.joins(:contract).where(contracts: {company_id: current_company.id}, invoice_type: 'timesheet_invoice').order("created_at DESC")
  end

  def cleared_invoice
    @invoices = Invoice.cleared_invoices.joins(:contract).where(contracts: {company_id: current_company.id}).order("created_at DESC")
    render 'index'
  end

  def submit_invoice
    inv = Invoice.where(id: params[:id]).first

    if inv
      timesheets = inv.contract.timesheets.approved_timesheets.where("start_date <= ? AND end_date <= ?", inv.start_date, inv.end_date)

      total_amount = 0
      total_approve_time = 0
      payrate = inv.contract.buy_contracts.first.payrate

      timesheets.each do |t|
        t.days.each_key do |k|
          if (inv.start_date <= k.to_date && inv.end_date >= k.to_date )
            total_amount += t.days[k].to_i * payrate
            total_approve_time += t.days[k].to_i
          end
        end
      end

      inv.total_amount = total_amount,
      inv.total_approve_time =  total_approve_time,
      inv.rate =  payrate
      inv.status =  :open

      inv.save
      flash[:success] = "Successfully Submitted"

    else
      flash[:errors] = ["Unable to accept this Invoice. "]
    end

    redirect_back fallback_location: root_path
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

     # if @invoice.total_approve_time <= 0 || @invoice.rate <= 0
     #   flash[:errors] = "Invoice not contains any amount. "
     #   redirect_back fallback_location: root_path
     # else
     #   @receive_payment = @invoice.receive_payments.new
     # end
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
    html = render_to_string( :layout => false)
    pdf = WickedPdf.new.pdf_from_string(html)
    send_data(pdf, :filename    => "#{@contract.title}.pdf", :type => "application/pdf", :disposition => 'attachment')
  end

  def authorized_user
    has_access?("manage_invoices")
  end

  def edit
    @invoice = Invoice.find(params[:id])
  end

  def update
    inv = Invoice.find(params[:id])
    next_inv = inv.contract.invoices.where(start_date: inv.end_date + 1.days).first
    new_date = Date.strptime(params[:invoice][:end_date], '%m/%d/%Y') rescue nil
    if !new_date.nil? && inv.start_date <= new_date
      if next_inv.present?
        if next_inv.end_date >= new_date
          inv.update!(end_date: new_date)
          set_invoice_timesheets(inv)
          next_inv.update!(start_date: inv.end_date + 1.days)
          set_invoice_timesheets(next_inv)
          flash[:errors] = "End Date Updated"
        else
          flash[:errors] = "Invalid Invoice End Date."
        end
      else
        inv.update!(end_date: params[:invoice][:end_date])
        set_invoice_timesheets(inv)
        flash[:errors] = "End Date Updated"
      end
    else
      flash[:errors] = "Invalid Invoice End Date."
    end
    redirect_to invoices_path
  end

  private

  def set_invoice_timesheets(inv)
    timesheets = inv.contract.timesheets.approved_timesheets.where("start_date <= ? AND end_date <= ?", inv.start_date, inv.end_date)

    total_amount = 0
    total_approve_time = 0
    payrate = inv.contract.buy_contracts.first.payrate

    timesheets.each do |t|
      t.days.each_key do |k|
        if (inv.start_date <= k.to_date && inv.end_date >= k.to_date )
          total_amount += t.days[k].to_i * payrate
          total_approve_time += t.days[k].to_i
        end
      end
    end
    inv.total_amount = total_amount,
    inv.total_approve_time =  total_approve_time,
    inv.rate =  payrate
    inv.save
  end

  def find_contract
    # @contract = current_company.sent_contracts.find(params[:contract_id])
    @contract = Contract.find_sent_or_received(params[:contract_id] , current_company).first || []
  end

  def find_invoice
    @invoice  = @contract.invoices.includes(timesheets: [timesheet_logs: [:transactions , :contract_term]]).find(params[:id])
    # if  !@contract.is_sent?(current_company)
    #
    # elsif  not (@invoice.submitted? && @contract.is_sent?(current_company))
    #   flash[:errors] = "Invoice is not submitted by Responde"
    #   redirect_to contract_invoices_path(@contract)
    # end
  end

  def set_invoices
    @invoices  =  @contract.invoices || []
  end

  def set_company_contract_invoices
    if params['contract_id'].present?
     @invoices  =  @contract.invoices || []
    end
    @send_contract_invoices = current_company.sent_invoices
    @rec_contract_invoices = current_company.received_invoices
  end

  def find_child_invoice_timesheet_logs invoice
    return invoice.parent_invoice.present? ?  find_child_invoice_timesheet_logs(invoice.parent_invoice) : invoice.timesheet_logs
  end

end
