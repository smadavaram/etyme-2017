class Company::ReceivePaymentsController < Company::BaseController

  def new
    @invoice = Invoice.find(params[:invoice_id])
    add_breadcrumb 'Invoice', invoices_path()
    add_breadcrumb 'Edit Invoice', new_invoice_receive_payment_path()
    @receive_payment = @invoice.receive_payments.new
    if @invoice.paid?
      flash[:success] = "Already Paid"
      redirect_to invoices_path
    end
  end

  def create
    @invoice = Invoice.find(params[:invoice_id])
    @receive_payment = @invoice.receive_payments.create(receive_payment_params)
    flash[:success] = "Payment Received."
    redirect_to invoices_path
  end

  private

  def receive_payment_params
    params.require(:receive_payment).permit(:payment_date, :payment_method, :reference_no, :deposit_to, :amount_received, :posted_as_discount, :memo, :attachment)
  end

end
