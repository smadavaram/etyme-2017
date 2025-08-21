if("<%= params[:status] %>" == 'accept' || "<%= params[:status] %>" == 'reject')
{
    $('#ajax-modal').html("<%= j render('company/contracts/partials/accept_contract_modal' , contract: @contract , status: params[:status])%>");
    $('#contract-<%= @contract.id %>').modal('show');
}
else
{
    flash_error('Error!');
}