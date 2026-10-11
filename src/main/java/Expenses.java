/**
 * One month's costs: the fourteen named cost lines, plus four "other"
 * amounts for columns that matched no line but still belong to a group.
 *
 * The lines fall into four groups, exactly as the dashboard groups them:
 *   direct costs       cost of goods sold, labor, employee meals, payroll tax
 *   operating costs    packaging, credit card fees, marketing, hardware
 *   variable overhead  utilities, maintenance
 *   fixed overhead     rent, insurance, business license, telephone
 */
public class Expenses {

    int monthNumber;

    double costOfGoodsSold;
    double labor;
    double employeeMeals;
    double payrollTax;

    double packaging;
    double creditCardFees;
    double marketing;
    double hardware;

    double utilities;
    double maintenance;

    double rent;
    double insurance;
    double businessLicense;
    double telephone;

    // Columns the file had that matched no line, added to the group they
    // behave like (see ColumnMapper).
    double otherDirect;
    double otherOperating;
    double otherVariable;
    double otherFixed;

    public Expenses(int monthNumber) {
        this.monthNumber = monthNumber;
    }

    public double directCosts() {
        return costOfGoodsSold + labor + employeeMeals + payrollTax + otherDirect;
    }

    public double operatingCosts() {
        return packaging + creditCardFees + marketing + hardware + otherOperating;
    }

    public double variableOverhead() {
        return utilities + maintenance + otherVariable;
    }

    public double fixedOverhead() {
        return rent + insurance + businessLicense + telephone + otherFixed;
    }
}
